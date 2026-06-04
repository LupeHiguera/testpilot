import { Diagnosis, ModelClient, ObservationArtifacts, RepairProposal, RunResult, TestIntent } from '../core/types.js';
import { diagnoseFailure } from '../diagnosis/diagnoseFailure.js';
import { PipelineEventStatus, PipelineStage } from '../events/types.js';
import { applyRepair } from './applyPatch.js';
import { proposePatch } from './proposePatch.js';
import { validatePatch } from './validatePatch.js';

export type RepairLoopStatus = 'passing' | 'needs-review';

export interface RepairAttempt {
  attempt: number;
  category: Diagnosis['category'];
  reason: string;
  applied: boolean;
  passedAfter: boolean;
  stoppedReason?: string;
}

export interface RepairLoopResult {
  status: RepairLoopStatus;
  diagnosis: Diagnosis;
  proposal?: RepairProposal;
  repairApplied: boolean;
  attempts: RepairAttempt[];
  /** The most recent page observation taken (for reuse, e.g. a PR's after-shot). */
  lastObservation?: ObservationArtifacts;
}

export interface RepairLoopDeps {
  testPath: string;
  intent: TestIntent;
  /** The failing run that opened this repair episode. */
  firstRun: RunResult;
  client: ModelClient;
  /** Re-observe the live page so each proposal is grounded in the CURRENT UI. */
  observe: () => Promise<ObservationArtifacts>;
  /** Re-run the (now patched) test and report whether it passes. */
  runTest: () => Promise<RunResult>;
  /** Stream stage events (same shape as emitStage, minus the runId). */
  emit: (stage: PipelineStage, status: PipelineEventStatus, label: string, data?: Record<string, unknown>) => void;
  vision?: boolean;
  /** Hard upper bound on repair attempts. Default 2. */
  maxAttempts?: number;
  /** Repo-relative failure screenshot, attached to the terminal repair event so
   *  the dashboard's before/after plates render. */
  beforeScreenshot?: string;
  /** Convert an absolute artifact path to the repo-relative form the UI serves.
   *  Used to attach the re-observed "after" screenshot to the terminal event. */
  relArtifact?: (absolutePath?: string) => string | undefined;
}

/**
 * Bounded, re-observing repair loop. On each attempt it diagnoses the current
 * failure, and only when the diagnosis is a safe-to-repair drift does it
 * re-observe the page, propose an observation-grounded patch, validate it, apply
 * it, and re-run. It stops — escalating to `needs-review` — the moment any safety
 * guard would be crossed:
 *
 *  - the (re)diagnosis is not repairable (e.g. a real regression surfaced),
 *  - `validatePatch` rejects the proposal (it still enforces generated-test-dir
 *    only, safe categories, and preserved assertions/route/user),
 *  - the model proposes the same patch twice (no progress), or
 *  - `maxAttempts` is exhausted without the test passing.
 *
 * It never relaxes a guard; the only new power versus the old one-shot path is a
 * second, page-grounded attempt before giving up.
 */
export async function runRepairLoop(deps: RepairLoopDeps): Promise<RepairLoopResult> {
  const { testPath, intent, client, observe, runTest, emit, vision, beforeScreenshot, relArtifact } = deps;
  const maxAttempts = deps.maxAttempts ?? 2;
  const attempts: RepairAttempt[] = [];

  let currentRun = deps.firstRun;
  let lastProposal: RepairProposal | undefined;
  let lastProposedContent: string | undefined;
  let lastObservation: ObservationArtifacts | undefined;
  let repairApplied = false;
  let diagnosis: Diagnosis = await diagnoseFailure(currentRun, intent, client, { vision });

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      emit('diagnose', 'info', `Re-diagnosing after attempt ${attempt - 1}: ${diagnosis.category} (${diagnosis.confidence})`, {
        attempt,
        diagnosis
      });
    } else {
      emit('diagnose', 'pass', `${diagnosis.category} (${diagnosis.confidence})`, { attempt, diagnosis });
    }

    if (!diagnosis.repairable) {
      // A non-repairable verdict (often a real regression revealed by an earlier
      // patch) is escalated to a human — never auto-edited away.
      const label =
        attempt === 1
          ? `Repair refused: ${diagnosis.category} is not safe to repair`
          : `Stopped after attempt ${attempt - 1}: ${diagnosis.category} is not safe to repair`;
      emit('repair', 'info', label, { attempt, maxAttempts });
      return finish('needs-review');
    }

    // Re-observe the page so the proposal reflects the current UI, not the stale failure.
    const observation = await observe();
    lastObservation = observation;
    const proposal = await proposePatch(client, { testPath, diagnosis, runResult: currentRun, observation });
    const validation = validatePatch(proposal, diagnosis);

    if (!validation.valid) {
      emit('repair', 'info', `Repair refused: ${validation.reason}`, { attempt, maxAttempts });
      attempts.push({ attempt, category: diagnosis.category, reason: proposal.reason, applied: false, passedAfter: false, stoppedReason: validation.reason });
      lastProposal = proposal;
      return finish('needs-review');
    }

    if (proposal.proposedContent === lastProposedContent) {
      // The model repeated the previous patch — re-running would only thrash.
      emit('repair', 'info', `Stopped after attempt ${attempt}: the repair made no further progress`, { attempt, maxAttempts });
      attempts.push({ attempt, category: diagnosis.category, reason: proposal.reason, applied: false, passedAfter: false, stoppedReason: 'no progress' });
      lastProposal = proposal;
      return finish('needs-review');
    }

    emit(
      'repair',
      'start',
      attempt === 1
        ? 'Applying a safe, intent-preserving repair'
        : `Re-observing and retrying the repair (attempt ${attempt}/${maxAttempts})`,
      { attempt, maxAttempts }
    );
    await applyRepair(proposal);
    repairApplied = true;
    lastProposal = proposal;
    lastProposedContent = proposal.proposedContent;

    const rerun = await runTest();
    const afterScreenshot = relArtifact?.(observation.screenshotPath);
    emit(
      'repair',
      rerun.passed ? 'pass' : 'fail',
      rerun.passed
        ? `Repair applied — test passes${attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : ''}`
        : `Repair applied — still failing (attempt ${attempt}/${maxAttempts})`,
      {
        attempt,
        maxAttempts,
        diff: proposal.diff,
        reason: proposal.reason,
        ...(beforeScreenshot ? { beforeScreenshot } : {}),
        ...(afterScreenshot ? { afterScreenshot } : {})
      }
    );
    attempts.push({ attempt, category: diagnosis.category, reason: proposal.reason, applied: true, passedAfter: rerun.passed });

    if (rerun.passed) {
      return finish('passing');
    }

    // Still failing: re-diagnose the NEW failure before the next attempt.
    currentRun = rerun;
    diagnosis = await diagnoseFailure(currentRun, intent, client, { vision });
  }

  emit('repair', 'info', `Repair did not pass after ${maxAttempts} attempt(s)`, { attempt: maxAttempts, maxAttempts });
  return finish('needs-review');

  function finish(status: RepairLoopStatus): RepairLoopResult {
    return { status, diagnosis, proposal: lastProposal, repairApplied, attempts, lastObservation };
  }
}
