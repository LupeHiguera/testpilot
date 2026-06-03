import { Diagnosis, ModelClient, RunResult, TestIntent } from '../core/types.js';
import { classifyFailure } from './classifyFailure.js';
import { mergeVisionDiagnosis } from './refineWithVision.js';

/**
 * Diagnose a failed run. Always runs the deterministic heuristic classifier;
 * when `vision` is enabled and a failure screenshot exists, refines the result
 * with the model's read of the screenshot under the safety invariant in
 * mergeVisionDiagnosis. Vision problems degrade gracefully back to the
 * heuristic verdict.
 */
export async function diagnoseFailure(
  runResult: RunResult,
  intent: TestIntent,
  client: ModelClient,
  options: { vision?: boolean } = {}
): Promise<Diagnosis> {
  const heuristic = await classifyFailure(runResult, intent);
  if (!options.vision || runResult.passed) {
    return heuristic;
  }

  const screenshotPath = runResult.failureArtifacts?.screenshotPath;
  if (!screenshotPath) {
    return { ...heuristic, reason: `${heuristic.reason} (no screenshot available for vision review)` };
  }

  try {
    const vision = await client.classifyScreenshot({ screenshotPath, intent, heuristic });
    return mergeVisionDiagnosis(heuristic, vision);
  } catch (error) {
    return { ...heuristic, reason: `${heuristic.reason} (vision review failed: ${String(error)})` };
  }
}
