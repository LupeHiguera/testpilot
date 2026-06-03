#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { observePage } from '../browser/observePage.js';
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
import { Project } from '../projects/types.js';
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
    const validation = validatePatch(proposal, diagnosis);
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

const specCmd = program.command('spec').description('Add and run testing stories');

specCmd
  .command('add')
  .argument('<project-id>')
  .argument('[file]')
  .option('--text <text>', 'Story text (instead of a file)')
  .option('--title <title>', 'Story title')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--vision', 'Refine diagnosis with a vision read of the failure screenshot')
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
      const result = await runStoryPipeline(project, story, { mode: options.mode as ModelMode, vision: Boolean(options.vision) });
      console.log(`Story ${result.status}`);
      console.log(`Test ${result.testPath}`);
    } finally {
      if (server) {
        stopProcessTree(server.pid);
      }
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
