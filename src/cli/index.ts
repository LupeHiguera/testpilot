#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { observePage } from '../browser/observePage.js';
import { fetchGithubStories } from '../connectors/github.js';
import { fetchJiraStories, JiraSourceConfig } from '../connectors/jira.js';
import { createRunDir, defaultBaseUrl, generatedTestsDir } from '../core/config.js';
import { generateDocs } from '../docs/generateDocs.js';
import { ModelMode } from '../core/types.js';
import { diagnoseFailure } from '../diagnosis/diagnoseFailure.js';
import { generatePlaywrightTest } from '../generator/generatePlaywrightTest.js';
import { createModelClient } from '../generator/modelClient.js';
import { runDemoWithServer } from '../pipeline/demo.js';
import { startDemoServer, stopProcessTree, withVariant } from '../pipeline/demoServer.js';
import { runStoryPipeline } from '../pipeline/story.js';
import { getProject, listProjects, saveProject } from '../projects/store.js';
import { Project, StorySource } from '../projects/types.js';
import { addStory } from '../stories/store.js';
import { createRepairPr } from '../pr/createRepairPr.js';
import { applyRepair } from '../repair/applyPatch.js';
import { proposePatch } from '../repair/proposePatch.js';
import { validatePatch } from '../repair/validatePatch.js';
import { writeReport } from '../reporting/writeReport.js';
import { runPlaywrightTest } from '../runner/runPlaywrightTest.js';
import { startLiveServer } from '../server/server.js';

const program = new Command();

program
  .name('testpilot')
  .description('Turn plain-English QA instructions into Playwright tests and safe repairs.')
  .version('0.1.0');

program
  .command('generate')
  .argument('<spec-file>')
  .option('--base-url <url>', 'Target app URL', defaultBaseUrl)
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--model <model>', 'OpenAI model')
  .action(async (specFile, options) => {
    const client = createModelClient(options.mode as ModelMode, options.model);
    const spec = await fs.readFile(path.resolve(specFile), 'utf8');
    const intent = await client.parseSpec(spec);
    const runDir = createRunDir('generate');
    const observation = await observePage(options.baseUrl, intent.route, runDir);
    const testPath = await generatePlaywrightTest(client, intent, observation);
    const reportPath = await writeReport({ runDir, intent, observation });
    console.log(`Generated ${testPath}`);
    console.log(`Report ${reportPath}`);
  });

program
  .command('run')
  .argument('<test-file>')
  .option('--base-url <url>', 'Target app URL', defaultBaseUrl)
  .option('--route <route>', 'Route for failure artifact collection', '/login')
  .option('--variant <variant>', 'Demo variant query string')
  .action(async (testFile, options) => {
    const runResult = await runPlaywrightTest({
      testPath: path.resolve(testFile),
      baseUrl: withVariant(options.baseUrl, options.variant),
      route: options.route,
      variant: options.variant
    });
    console.log(runResult.passed ? 'Passed' : 'Failed');
    console.log(`Run artifacts ${runResult.runDir}`);
  });

program
  .command('diagnose')
  .argument('<run-result-json>')
  .argument('<spec-file>')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--vision', 'Refine the diagnosis with a vision read of the failure screenshot')
  .action(async (runResultJson, specFile, options) => {
    const client = createModelClient(options.mode as ModelMode);
    const spec = await fs.readFile(path.resolve(specFile), 'utf8');
    const intent = await client.parseSpec(spec);
    const runResult = JSON.parse(await fs.readFile(path.resolve(runResultJson), 'utf8'));
    const diagnosis = await diagnoseFailure(runResult, intent, client, { vision: Boolean(options.vision) });
    console.log(JSON.stringify(diagnosis, null, 2));
  });

program
  .command('repair')
  .argument('<test-file>')
  .argument('<run-result-json>')
  .argument('<spec-file>')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--model <model>', 'OpenAI model')
  .option('--open-pr', 'Open a GitHub PR for the repair instead of only writing a local bundle')
  .option('--base-branch <branch>', 'Base branch for the PR', 'main')
  .option('--vision', 'Refine the diagnosis with a vision read of the failure screenshot')
  .action(async (testFile, runResultJson, specFile, options) => {
    const client = createModelClient(options.mode as ModelMode, options.model);
    const spec = await fs.readFile(path.resolve(specFile), 'utf8');
    const intent = await client.parseSpec(spec);
    const runResult = JSON.parse(await fs.readFile(path.resolve(runResultJson), 'utf8'));
    const diagnosis = await diagnoseFailure(runResult, intent, client, { vision: Boolean(options.vision) });
    const proposal = await proposePatch(client, {
      testPath: path.resolve(testFile),
      diagnosis,
      runResult
    });
    const validation = validatePatch(proposal, diagnosis, intent);
    if (!validation.valid) {
      console.log(`Refused repair: ${validation.reason}`);
      return;
    }
    await applyRepair(proposal);
    console.log(`Applied repair: ${validation.reason}`);

    const pr = await createRepairPr({
      testPath: path.resolve(testFile),
      proposal,
      diagnosis,
      intent,
      runDir: createRunDir('repair'),
      beforeScreenshot: runResult.failureArtifacts?.screenshotPath,
      baseBranch: options.baseBranch,
      openPr: Boolean(options.openPr)
    });
    if (pr.opened) {
      console.log(`Opened PR: ${pr.prUrl}`);
    } else {
      if (pr.skippedReason) {
        console.log(pr.skippedReason);
      }
      console.log(`PR bundle: ${pr.bundleDir}`);
    }
  });

program
  .command('demo')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--model <model>', 'OpenAI model')
  .option('--base-url <url>', 'Demo app URL', defaultBaseUrl)
  .action(async (options) => {
    const result = await runDemoWithServer({ mode: options.mode as ModelMode, model: options.model, baseUrl: options.baseUrl });
    if (result.prBundleDir) {
      console.log(`Repair PR bundle ${result.prBundleDir}`);
    }
    console.log(`Demo report ${result.reportPath}`);
  });

/** Commander collector for repeatable options (e.g. --header a --header b -> [a, b]). */
const collect = (value: string, previous: string[]): string[] => previous.concat([value]);

/** Parse repeated "key<sep>value" flags into an object (e.g. "Authorization: Bearer x"
 *  with sep ":", or "TOKEN=abc" with sep "="). Splits on the FIRST separator only. */
function parseKeyValues(pairs: string[], sep: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf(sep);
    if (idx === -1) continue;
    out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Build an McpServerConfig from add-source flags: --url => remote http/sse, else
 *  --command => local stdio. Returns undefined when neither is given. */
function mcpConfigFromOptions(options: AddSourceOptions): Record<string, unknown> | undefined {
  if (options.url) {
    const transport = options.transport === 'sse' ? 'sse' : 'http';
    const headers = parseKeyValues(options.header, ':');
    return { transport, url: options.url, ...(headers ? { headers } : {}) };
  }
  if (options.command) {
    const env = parseKeyValues(options.env, '=');
    return {
      command: options.command,
      ...(options.arg.length ? { args: options.arg } : {}),
      ...(env ? { env } : {})
    };
  }
  return undefined;
}

/** Assemble a source `config` object from flags for a jira/github source. */
function sourceConfigFromOptions(type: string, options: AddSourceOptions): Record<string, unknown> | undefined {
  const mcp = mcpConfigFromOptions(options);
  if (type === 'jira') {
    return {
      ...(options.jql ? { jql: options.jql } : {}),
      ...(options.tool ? { tool: options.tool } : {}),
      ...(mcp ? { mcp } : {})
    };
  }
  if (type === 'github') {
    return {
      ...(options.owner ? { owner: options.owner } : {}),
      ...(options.repo ? { repo: options.repo } : {}),
      ...(options.label ? { label: options.label } : {}),
      ...(mcp ? { mcp } : {})
    };
  }
  return undefined;
}

interface AddSourceOptions {
  type: string;
  config?: string;
  url?: string;
  transport?: string;
  header: string[];
  command?: string;
  arg: string[];
  env: string[];
  jql?: string;
  tool?: string;
  owner?: string;
  repo?: string;
  label?: string;
}

const projectCmd = program.command('project').description('Manage connected projects');

projectCmd
  .command('list')
  .action(async () => {
    for (const project of await listProjects()) {
      console.log(`${project.id}\t${project.name}\t${project.baseUrl}\t${project.repoPath}`);
    }
  });

projectCmd
  .command('add')
  .argument('<id>')
  .requiredOption('--name <name>', 'Display name')
  .requiredOption('--repo <path>', 'Path to the connected repo')
  .requiredOption('--base-url <url>', 'Where the app under test serves')
  .option('--tests-dir <dir>', 'Test output dir (relative to repo)', 'tests')
  .option('--docs-dir <dir>', 'Docs output dir (relative to repo)', 'docs')
  .option('--route <route>', 'Default route to observe', '/login')
  .option('--email <email>', 'Test login email')
  .option('--password <password>', 'Test login password')
  .option('--runnable', 'testpilot can run the generated tests here (shares its Playwright context)')
  .action(async (id, options) => {
    const project: Project = {
      id,
      name: options.name,
      repoPath: path.resolve(options.repo),
      baseUrl: options.baseUrl,
      testsDir: options.testsDir,
      docsDir: options.docsDir,
      route: options.route,
      credentials: options.email ? { email: options.email, password: options.password ?? '' } : undefined,
      framework: 'playwright',
      runnable: Boolean(options.runnable),
      sources: [{ type: 'upload' }]
    };
    const file = await saveProject(project);
    console.log(`Saved project ${id} → ${file}`);
  });

projectCmd
  .command('add-source')
  .description('Attach a story source to a project (no hand-editing the project JSON)')
  .argument('<project-id>')
  .requiredOption('--type <type>', 'Source type: jira, github, or upload')
  .option('--config <json>', 'Full source config as JSON (escape hatch; wins over the flags below)')
  .option('--url <url>', 'Remote MCP endpoint URL (selects an http/sse transport)')
  .option('--transport <kind>', 'Transport for --url: http (default) or sse')
  .option('--header <kv>', 'Header for the remote MCP server, "Key: Value" (repeatable)', collect, [])
  .option('--command <command>', 'Command to launch a local stdio MCP server')
  .option('--arg <arg>', 'Argument for the stdio --command (repeatable)', collect, [])
  .option('--env <kv>', 'Env var for the stdio server, "KEY=value" (repeatable)', collect, [])
  .option('--jql <jql>', 'JQL query (jira)')
  .option('--tool <tool>', 'Tool name to call (jira; default jira_search)')
  .option('--owner <owner>', 'Repo owner (github)')
  .option('--repo <repo>', 'Repo name (github)')
  .option('--label <label>', 'Issue label filter (github)')
  .action(async (projectId: string, options: AddSourceOptions) => {
    const project = await getProject(projectId);
    if (!project) {
      console.error(`Unknown project: ${projectId}`);
      process.exitCode = 1;
      return;
    }
    const type = options.type;
    if (type !== 'jira' && type !== 'github' && type !== 'upload') {
      console.error(`Unknown source type: ${type} (expected jira, github, or upload)`);
      process.exitCode = 1;
      return;
    }
    let config: Record<string, unknown> | undefined;
    if (options.config) {
      try {
        config = JSON.parse(options.config) as Record<string, unknown>;
      } catch (error) {
        console.error(`--config is not valid JSON: ${(error as Error).message}`);
        process.exitCode = 1;
        return;
      }
    } else {
      config = sourceConfigFromOptions(type, options);
    }
    const source: StorySource = { type, ...(config && Object.keys(config).length ? { config } : {}) };
    // Replace any existing source of the same type so re-running updates it in place.
    project.sources = [...project.sources.filter((entry) => entry.type !== type), source];
    const file = await saveProject(project);
    console.log(`Added ${type} source to ${projectId} → ${file}`);
  });

const specCmd = program.command('spec').description('Add and run testing stories');

specCmd
  .command('add')
  .argument('<project-id>')
  .argument('[file]')
  .option('--text <text>', 'Story text (instead of a file)')
  .option('--title <title>', 'Story title')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--vision', 'Refine diagnosis with a vision read of the failure screenshot')
  .option('--open-pr', 'When a safe repair re-runs green, open a GitHub PR in the project repo (default: bundle only)')
  .action(async (projectId, file, options) => {
    const project = await getProject(projectId);
    if (!project) {
      console.error(`Unknown project: ${projectId}`);
      process.exitCode = 1;
      return;
    }
    const body = options.text ?? (await fs.readFile(path.resolve(file), 'utf8'));
    const title = options.title ?? (file ? path.basename(file) : body.trim().slice(0, 60));
    const story = await addStory({ projectId, source: 'upload', title, body });
    console.log(`Added story ${story.id} ("${title}") to ${projectId}`);

    // testpilot manages the demo app; connected projects run their own dev server.
    const server = project.id === 'demo' ? await startDemoServer() : undefined;
    try {
      const result = await runStoryPipeline(project, story, {
        mode: options.mode as ModelMode,
        vision: Boolean(options.vision),
        openPr: Boolean(options.openPr)
      });
      console.log(`Story ${result.status}`);
      console.log(`Test ${result.testPath}`);
      if (result.prUrl) {
        console.log(`Repair PR ${result.prUrl}`);
      } else if (result.prBundleDir) {
        console.log(`Repair PR bundle ${result.prBundleDir}`);
      }
    } finally {
      if (server) {
        stopProcessTree(server.pid);
      }
    }
  });

specCmd
  .command('pull')
  .description('Pull GitHub issues as stories via the GitHub MCP server')
  .argument('<project-id>')
  .requiredOption('--owner <owner>', 'GitHub repo owner')
  .requiredOption('--repo <repo>', 'GitHub repo name')
  .option('--label <label>', 'Only issues with this label')
  .option('--generate', 'Generate a test for each pulled story')
  .option('--mode <mode>', 'Model mode for --generate', 'mock')
  .action(async (projectId, options) => {
    const project = await getProject(projectId);
    if (!project) {
      console.error(`Unknown project: ${projectId}`);
      process.exitCode = 1;
      return;
    }
    const token = await resolveGithubToken();
    if (!token) {
      console.error('No GitHub token found. Set GITHUB_TOKEN or run `gh auth login`.');
      process.exitCode = 1;
      return;
    }
    const mapped = await fetchGithubStories({ owner: options.owner, repo: options.repo, label: options.label }, token);
    console.log(`Pulled ${mapped.length} issue(s) from ${options.owner}/${options.repo}`);
    for (const item of mapped) {
      const story = await addStory({ projectId: project.id, source: 'github', externalId: item.externalId, title: item.title, body: item.body });
      console.log(`  ${story.externalId}  ${story.title}`);
      if (options.generate) {
        const appServer = project.id === 'demo' ? await startDemoServer() : undefined;
        try {
          const result = await runStoryPipeline(project, story, { mode: options.mode as ModelMode });
          console.log(`    → ${result.status}`);
        } finally {
          if (appServer) {
            stopProcessTree(appServer.pid);
          }
        }
      }
    }
  });

specCmd
  .command('pull-jira')
  .description('Pull Jira issues as stories via a configured Jira MCP server')
  .argument('<project-id>')
  .option('--jql <jql>', 'Override the JQL from the project source config')
  .action(async (projectId, options) => {
    const project = await getProject(projectId);
    if (!project) {
      console.error(`Unknown project: ${projectId}`);
      process.exitCode = 1;
      return;
    }
    const source = project.sources.find((entry) => entry.type === 'jira');
    const config = source?.config as unknown as JiraSourceConfig | undefined;
    if (!config?.mcp) {
      console.error(
        'No Jira source configured. Add a sources[] entry of type "jira" with config.jql and config.mcp ' +
          '(either a stdio launch { command, args, env } or a remote endpoint { transport: "http"|"sse", url, headers }) to the project file.'
      );
      process.exitCode = 1;
      return;
    }
    const mapped = await fetchJiraStories({ ...config, jql: options.jql ?? config.jql });
    console.log(`Pulled ${mapped.length} Jira issue(s)`);
    for (const item of mapped) {
      const story = await addStory({ projectId: project.id, source: 'jira', externalId: item.externalId, title: item.title, body: item.body });
      console.log(`  ${story.externalId}  ${story.title}`);
    }
  });

program
  .command('docs')
  .description('Generate living documentation for a connected project')
  .argument('<project-id>')
  .action(async (projectId) => {
    const project = await getProject(projectId);
    if (!project) {
      console.error(`Unknown project: ${projectId}`);
      process.exitCode = 1;
      return;
    }
    const result = await generateDocs(project);
    console.log(`Generated docs for ${result.flowCount} flow(s) → ${result.indexPath}`);
  });

program
  .command('serve')
  .description('Start the live-view dashboard server')
  .option('--port <port>', 'Port to listen on', '4000')
  .action((options) => {
    startLiveServer(Number(options.port));
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

await fs.mkdir(generatedTestsDir, { recursive: true });

async function resolveGithubToken(): Promise<string | undefined> {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }
  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }
  return new Promise((resolve) => {
    const child =
      process.platform === 'win32' ? spawn('cmd.exe', ['/c', 'gh', 'auth', 'token']) : spawn('gh', ['auth', 'token']);
    let out = '';
    child.stdout?.on('data', (chunk) => {
      out += chunk.toString();
    });
    child.on('error', () => resolve(undefined));
    child.on('close', () => resolve(out.trim() || undefined));
  });
}
