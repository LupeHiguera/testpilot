import fs from 'node:fs/promises';
import path from 'node:path';
import { observePage } from '../browser/observePage.js';
import { createRunDir, projectRoot } from '../core/config.js';
import { ModelMode } from '../core/types.js';
import { diagnoseFailure } from '../diagnosis/diagnoseFailure.js';
import { emitStage } from '../events/bus.js';
import { PipelineEventStatus, PipelineStage } from '../events/types.js';
import { generatePlaywrightTest } from '../generator/generatePlaywrightTest.js';
import { createModelClient } from '../generator/modelClient.js';
import { createRepairPr } from '../pr/createRepairPr.js';
import { runRepairLoop } from '../repair/repairLoop.js';
import { writeReport } from '../reporting/writeReport.js';
import { runPlaywrightTest } from '../runner/runPlaywrightTest.js';
import { startDemoServer, stopProcessTree, withVariant } from './demoServer.js';

export interface DemoOptions {
  mode: ModelMode;
  model?: string;
  baseUrl: string;
}

export interface DemoResult {
  reportPath: string;
  runDir: string;
  runId: string;
  prBundleDir?: string;
}

/** Start the demo app, run the pipeline, and always tear the app down. */
export async function runDemoWithServer(options: DemoOptions): Promise<DemoResult> {
  const server = await startDemoServer();
  try {
    return await runDemoPipeline(options);
  } finally {
    stopProcessTree(server.pid);
  }
}

/** The demo pipeline. Assumes the demo app is already serving at options.baseUrl. */
export async function runDemoPipeline({ mode, model, baseUrl }: DemoOptions): Promise<DemoResult> {
  const client = createModelClient(mode, model);
  const runDir = createRunDir('demo');
  const runId = path.basename(runDir);
  const emit = (stage: PipelineStage, status: PipelineEventStatus, label: string, data?: Record<string, unknown>) =>
    emitStage(runId, stage, status, label, data);

  try {
    emit('spec', 'start', 'Parsing the plain-English spec');
    const specPath = path.join(projectRoot, 'examples', 'login-spec.md');
    const spec = await fs.readFile(specPath, 'utf8');
    const intent = await client.parseSpec(spec);
    emit('spec', 'pass', `Intent: ${intent.route} → ${intent.expectedPath}`, { intent });

    emit('observe', 'start', `Observing ${intent.route}`);
    const observation = await observePage(baseUrl, intent.route, runDir);
    emit('observe', 'pass', `Captured ${observation.buttons.length} buttons, ${observation.inputs.length} inputs`, {
      screenshot: rel(observation.screenshotPath),
      buttons: observation.buttons
    });

    emit('generate', 'start', 'Generating the Playwright test');
    const testPath = await generatePlaywrightTest(client, intent, observation);
    // Snapshot the pristine test so the regression scenario runs independently of
    // any repair applied to the shared file.
    const pristineTest = await fs.readFile(testPath, 'utf8');
    emit('generate', 'pass', 'Test generated', { test: rel(testPath) });

    emit('run', 'start', 'Running against the unchanged app', { scenario: 'normal' });
    const normalRun = await runPlaywrightTest({ testPath, baseUrl, route: intent.route });
    emit('run', normalRun.passed ? 'pass' : 'fail', `Normal login: ${normalRun.passed ? 'passed' : 'failed'}`, {
      scenario: 'normal'
    });

    emit('run', 'start', 'Running against the copy-change variant', { scenario: 'copy-change' });
    const copyRun = await runPlaywrightTest({
      testPath,
      baseUrl: withVariant(baseUrl, 'copy-change'),
      route: intent.route,
      variant: 'copy-change'
    });
    emit('run', copyRun.passed ? 'pass' : 'fail', `Copy-change: ${copyRun.passed ? 'passed' : 'failed'}`, {
      scenario: 'copy-change',
      failureScreenshot: rel(copyRun.failureArtifacts?.screenshotPath)
    });

    emit('diagnose', 'start', 'Diagnosing the copy-change failure', { scenario: 'copy-change' });
    // Tag every loop event with the copy-change scenario so the dashboard groups them.
    const copyEmit = (stage: PipelineStage, status: PipelineEventStatus, label: string, data?: Record<string, unknown>) =>
      emit(stage, status, label, { scenario: 'copy-change', ...data });
    const copyRepair = await runRepairLoop({
      testPath,
      intent,
      firstRun: copyRun,
      client,
      vision: true,
      observe: () => observePage(withVariant(baseUrl, 'copy-change'), intent.route, createRunDir('demo-repair')),
      runTest: () =>
        runPlaywrightTest({ testPath, baseUrl: withVariant(baseUrl, 'copy-change'), route: intent.route, variant: 'copy-change' }),
      emit: copyEmit,
      beforeScreenshot: rel(copyRun.failureArtifacts?.screenshotPath),
      relArtifact: rel
    });
    const diagnosis = copyRepair.diagnosis;
    const proposal = copyRepair.proposal;
    const repairApplied = copyRepair.repairApplied;
    const copyRepairPassed = copyRepair.status === 'passing';
    let prBundleDir: string | undefined;
    // Only bundle a repair that re-ran green: an applied-but-still-failing patch
    // is escalated as needs-review, not handed to a human as a proposed PR.
    if (repairApplied && proposal && copyRepairPassed) {
      // Bundle the applied repair for human review, reusing the loop's last
      // observation as the "after" screenshot (no extra browser launch).
      const pr = await createRepairPr({
        testPath,
        proposal,
        diagnosis,
        intent,
        runDir,
        beforeScreenshot: copyRun.failureArtifacts?.screenshotPath,
        afterScreenshot: copyRepair.lastObservation?.screenshotPath,
        openPr: false
      });
      prBundleDir = pr.bundleDir;
      copyEmit('pr', 'info', 'Repair PR bundle written', { bundleDir: rel(prBundleDir) });
    }

    // Regression is an independent scenario: run the pristine test, not the repaired one.
    await fs.writeFile(testPath, pristineTest, 'utf8');
    emit('run', 'start', 'Running against the regression variant', { scenario: 'regression' });
    const regressionRun = await runPlaywrightTest({
      testPath,
      baseUrl: withVariant(baseUrl, 'regression'),
      route: intent.route,
      variant: 'regression'
    });
    emit('run', regressionRun.passed ? 'pass' : 'fail', `Regression: ${regressionRun.passed ? 'passed' : 'failed'}`, {
      scenario: 'regression',
      failureScreenshot: rel(regressionRun.failureArtifacts?.screenshotPath)
    });

    emit('diagnose', 'start', 'Diagnosing the regression failure', { scenario: 'regression' });
    const regressionDiagnosis = await diagnoseFailure(regressionRun, intent, client, { vision: true });
    emit('diagnose', regressionDiagnosis.repairable ? 'info' : 'pass', `${regressionDiagnosis.category} — ${regressionDiagnosis.repairable ? 'repairable' : 'repair refused'}`, {
      scenario: 'regression',
      diagnosis: regressionDiagnosis
    });

    const reportPath = await writeReport({
      runDir,
      intent,
      observation,
      runResult: copyRepairPassed ? regressionRun : copyRun,
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
          passed: copyRepairPassed,
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
      JSON.stringify(
        { normalRun, copyRun, diagnosis, copyRepair, repairApplied, copyRepairPassed, regressionRun, regressionDiagnosis, prBundleDir },
        null,
        2
      ),
      'utf8'
    );
    emit('decision', 'pass', 'Run complete', { report: rel(reportPath) });
    return { reportPath, runDir, runId, prBundleDir };
  } catch (error) {
    emit('decision', 'fail', `Run failed: ${String(error)}`);
    throw error;
  }
}

/** Convert an absolute artifact path to a repo-relative POSIX path the server can serve. */
function rel(absolute?: string): string | undefined {
  if (!absolute) {
    return undefined;
  }
  return path.relative(projectRoot, absolute).split(path.sep).join('/');
}
