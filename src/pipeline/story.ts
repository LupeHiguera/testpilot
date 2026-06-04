import path from 'node:path';
import { observePage } from '../browser/observePage.js';
import { createRunDir, projectRoot } from '../core/config.js';
import { ModelMode } from '../core/types.js';
import { emitStage } from '../events/bus.js';
import { PipelineEventStatus, PipelineStage } from '../events/types.js';
import { generatePlaywrightTest } from '../generator/generatePlaywrightTest.js';
import { createModelClient } from '../generator/modelClient.js';
import { Project } from '../projects/types.js';
import { runRepairLoop } from '../repair/repairLoop.js';
import { writeReport } from '../reporting/writeReport.js';
import { runPlaywrightTest } from '../runner/runPlaywrightTest.js';
import { updateStory } from '../stories/store.js';
import { Story, StoryStatus } from '../stories/types.js';

export interface StoryRunResult {
  runId: string;
  runDir: string;
  testPath: string;
  status: StoryStatus;
}

/**
 * Run one story against a connected project: parse the natural-language story into
 * intent, observe the app, generate a test INTO the project's repo, run it, and (on
 * failure) diagnose and attempt a safe repair. Streams stage events for the live view.
 */
export async function runStoryPipeline(
  project: Project,
  story: Story,
  opts: { mode: ModelMode; model?: string; vision?: boolean } = { mode: 'mock' }
): Promise<StoryRunResult> {
  const client = createModelClient(opts.mode, opts.model);
  const runDir = createRunDir(`story-${story.id}`);
  const runId = path.basename(runDir);
  const emit = (stage: PipelineStage, status: PipelineEventStatus, label: string, data?: Record<string, unknown>) =>
    emitStage(runId, stage, status, label, data);
  const testPath = path.join(project.repoPath, project.testsDir, `${story.id}.spec.ts`);

  try {
    emit('spec', 'start', `Parsing story: ${story.title}`, { project: project.id, story: story.id });
    const intent = await client.parseSpec(story.body);
    emit('spec', 'pass', `Intent: ${intent.route} → ${intent.expectedPath}`, { intent });

    emit('observe', 'start', `Observing ${project.baseUrl}${intent.route}`);
    const observation = await observePage(project.baseUrl, intent.route, runDir);
    emit('observe', 'pass', `Captured ${observation.buttons.length} buttons, ${observation.inputs.length} inputs`, {
      screenshot: rel(observation.screenshotPath)
    });

    emit('generate', 'start', 'Generating the Playwright test');
    await generatePlaywrightTest(client, intent, observation, testPath);
    emit('generate', 'pass', `Test written to ${project.testsDir}/${story.id}.spec.ts`, { testPath: rel(testPath) });
    await updateStory(project.id, story.id, { status: 'generated' });

    if (!project.runnable) {
      // External repos run their own tests; testpilot only authored it here.
      await writeReport({ runDir, intent, observation });
      emit('decision', 'pass', 'Test generated (project runs its own tests)');
      return { runId, runDir, testPath, status: 'generated' };
    }

    emit('run', 'start', `Running against ${project.name}`);
    const runResult = await runPlaywrightTest({ testPath, baseUrl: project.baseUrl, route: intent.route });
    emit('run', runResult.passed ? 'pass' : 'fail', `Test ${runResult.passed ? 'passed' : 'failed'}`, {
      failureScreenshot: rel(runResult.failureArtifacts?.screenshotPath)
    });

    let status: StoryStatus = runResult.passed ? 'passing' : 'failing';
    if (!runResult.passed) {
      emit('diagnose', 'start', 'Diagnosing the failure');
      const repair = await runRepairLoop({
        testPath,
        intent,
        firstRun: runResult,
        client,
        vision: opts.vision,
        observe: () => observePage(project.baseUrl, intent.route, createRunDir(`story-${story.id}-repair`)),
        runTest: () => runPlaywrightTest({ testPath, baseUrl: project.baseUrl, route: intent.route }),
        emit
      });
      status = repair.status;
      await writeReport({
        runDir,
        intent,
        observation,
        runResult,
        diagnosis: repair.diagnosis,
        repair: repair.proposal,
        repairApplied: repair.repairApplied,
        attempts: repair.attempts.length
      });
    } else {
      await writeReport({ runDir, intent, observation, runResult });
    }

    await updateStory(project.id, story.id, { status });
    emit('decision', status === 'passing' ? 'pass' : 'info', `Story ${status}`);
    return { runId, runDir, testPath, status };
  } catch (error) {
    emit('decision', 'fail', `Story run failed: ${String(error)}`);
    throw error;
  }
}

function rel(absolute?: string): string | undefined {
  if (!absolute) {
    return undefined;
  }
  return path.relative(projectRoot, absolute).split(path.sep).join('/');
}
