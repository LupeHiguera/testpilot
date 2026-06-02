#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Command } from 'commander';
import { observePage } from '../browser/observePage.js';
import { createRunDir, defaultBaseUrl, generatedTestsDir, projectRoot } from '../core/config.js';
import { ModelMode } from '../core/types.js';
import { classifyFailure } from '../diagnosis/classifyFailure.js';
import { generatePlaywrightTest } from '../generator/generatePlaywrightTest.js';
import { createModelClient } from '../generator/modelClient.js';
import { applyRepair } from '../repair/applyPatch.js';
import { proposePatch } from '../repair/proposePatch.js';
import { validatePatch } from '../repair/validatePatch.js';
import { writeReport } from '../reporting/writeReport.js';
import { runPlaywrightTest } from '../runner/runPlaywrightTest.js';

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
  .action(async (runResultJson, specFile, options) => {
    const client = createModelClient(options.mode as ModelMode);
    const spec = await fs.readFile(path.resolve(specFile), 'utf8');
    const intent = await client.parseSpec(spec);
    const runResult = JSON.parse(await fs.readFile(path.resolve(runResultJson), 'utf8'));
    const diagnosis = await classifyFailure(runResult, intent);
    console.log(JSON.stringify(diagnosis, null, 2));
  });

program
  .command('repair')
  .argument('<test-file>')
  .argument('<run-result-json>')
  .argument('<spec-file>')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--model <model>', 'OpenAI model')
  .action(async (testFile, runResultJson, specFile, options) => {
    const client = createModelClient(options.mode as ModelMode, options.model);
    const spec = await fs.readFile(path.resolve(specFile), 'utf8');
    const intent = await client.parseSpec(spec);
    const runResult = JSON.parse(await fs.readFile(path.resolve(runResultJson), 'utf8'));
    const diagnosis = await classifyFailure(runResult, intent);
    const proposal = await proposePatch(client, {
      testPath: path.resolve(testFile),
      diagnosis,
      runResult
    });
    const validation = validatePatch(proposal, diagnosis);
    if (validation.valid) {
      await applyRepair(proposal);
      console.log(`Applied repair: ${validation.reason}`);
    } else {
      console.log(`Refused repair: ${validation.reason}`);
    }
  });

program
  .command('demo')
  .option('--mode <mode>', 'Model mode: mock or openai', 'mock')
  .option('--model <model>', 'OpenAI model')
  .option('--base-url <url>', 'Demo app URL', defaultBaseUrl)
  .action(async (options) => {
    const server = await startDemoServer();
    try {
      const report = await runDemo(options.mode as ModelMode, options.model, options.baseUrl);
      console.log(`Demo report ${report}`);
    } finally {
      stopProcessTree(server.pid);
    }
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function runDemo(mode: ModelMode, model: string | undefined, baseUrl: string) {
  const client = createModelClient(mode, model);
  const specPath = path.join(projectRoot, 'examples', 'login-spec.md');
  const spec = await fs.readFile(specPath, 'utf8');
  const intent = await client.parseSpec(spec);
  const runDir = createRunDir('demo');
  const observation = await observePage(baseUrl, intent.route, runDir);
  const testPath = await generatePlaywrightTest(client, intent, observation);

  const normalRun = await runPlaywrightTest({ testPath, baseUrl, route: intent.route });
  const copyRun = await runPlaywrightTest({ testPath, baseUrl: withVariant(baseUrl, 'copy-change'), route: intent.route, variant: 'copy-change' });
  const diagnosis = await classifyFailure(copyRun, intent);
  const proposal = await proposePatch(client, { testPath, diagnosis, runResult: copyRun });
  const validation = validatePatch(proposal, diagnosis);
  let repairApplied = false;
  let repairedRun = copyRun;
  if (validation.valid) {
    await applyRepair(proposal);
    repairApplied = true;
    repairedRun = await runPlaywrightTest({ testPath, baseUrl: withVariant(baseUrl, 'copy-change'), route: intent.route, variant: 'copy-change' });
  }

  const regressionRun = await runPlaywrightTest({ testPath, baseUrl: withVariant(baseUrl, 'regression'), route: intent.route, variant: 'regression' });
  const regressionDiagnosis = await classifyFailure(regressionRun, intent);

  const reportPath = await writeReport({
    runDir,
    intent,
    observation,
    runResult: repairedRun.passed ? regressionRun : copyRun,
    diagnosis: regressionDiagnosis.category === 'PRODUCT_REGRESSION' ? regressionDiagnosis : diagnosis,
    repair: proposal,
    repairApplied,
    scenarios: [
      {
        name: 'Normal login generation',
        passed: normalRun.passed,
        note: 'Generated test should pass against the unchanged demo app.'
      },
      {
        name: 'Safe copy-change repair',
        passed: repairedRun.passed,
        diagnosis: diagnosis.category,
        repairApplied,
        note: 'Button text changed while the login behavior remained equivalent.'
      },
      {
        name: 'Regression detection',
        passed: regressionRun.passed,
        diagnosis: regressionDiagnosis.category,
        repairApplied: false,
        note: 'Login no longer reaches the dashboard, so test weakening is refused.'
      }
    ]
  });

  await fs.writeFile(
    path.join(runDir, 'demo-summary.json'),
    JSON.stringify({ normalRun, copyRun, diagnosis, validation, repairApplied, repairedRun, regressionRun, regressionDiagnosis }, null, 2),
    'utf8'
  );
  return reportPath;
}

function withVariant(baseUrl: string, variant?: string) {
  if (!variant) {
    return baseUrl;
  }
  const url = new URL(baseUrl);
  url.searchParams.set('variant', variant);
  return url.toString();
}

async function startDemoServer() {
  const child = spawnCommand('npx', ['vite', '--host', '127.0.0.1', '--port', '3000'], {
    cwd: projectRoot,
    shell: false,
    stdio: 'pipe'
  });
  await waitForServer(defaultBaseUrl);
  return child;
}

async function waitForServer(url: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw new Error(`Timed out waiting for demo server at ${url}`);
}

await fs.mkdir(generatedTestsDir, { recursive: true });

function spawnCommand(command: string, args: string[], options: Parameters<typeof spawn>[2]) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', command, ...args], options);
  }
  return spawn(command, args, options);
}

function stopProcessTree(pid: number | undefined) {
  if (!pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    process.kill(pid);
  } catch {
    // Process already exited.
  }
}
