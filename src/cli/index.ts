#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { observePage } from '../browser/observePage.js';
import { createRunDir, defaultBaseUrl, generatedTestsDir } from '../core/config.js';
import { ModelMode } from '../core/types.js';
import { diagnoseFailure } from '../diagnosis/diagnoseFailure.js';
import { generatePlaywrightTest } from '../generator/generatePlaywrightTest.js';
import { createModelClient } from '../generator/modelClient.js';
import { runDemoWithServer } from '../pipeline/demo.js';
import { withVariant } from '../pipeline/demoServer.js';
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
