import type { PipelineEvent, Status } from './types';

/**
 * The dashboard's READ LAYER: pure functions that derive *what to show* from raw
 * pipeline events / run reports. They hold no React or browser state and never
 * touch the agent core, so they are unit-tested in isolation
 * (tests/unit/runModel.test.ts) and the view components stay thin renderers over
 * their results.
 *
 * PERF BUDGET (stated AND enforced in CI by tools/perf-budget.ts): the dashboard's
 * initial paint loads in under ~1.2s, and the DOM budgets are scoped to the LIVE
 * CANYON PANE (`.canyon-pane` — the strata staircase, atmosphere, and evidence
 * ledger): near-empty idle, and bounded under ~4500 nodes even after a FULL demo
 * run renders every layer. Scoping matters: the Expeditions history rail grows
 * with the local run archive, so whole-page counts differ between a dev box and
 * a fresh CI runner — those totals are reported as information, not gated. Keep
 * these derivations O(events) and keep heavy per-row mounts (evidence plates +
 * diffs) lazy/gated so canyon DOM growth stays roughly linear in run length.
 */
export const PERF_BUDGET = {
  maxLoadMs: 1200,
  /** `.canyon-pane *` on the fresh idle dashboard (the empty state is ~30 nodes;
   *  this catches accidentally eager-mounting the canyon before a run exists). */
  maxIdleCanyonNodes: 200,
  /** `.canyon-pane *` after a full demo run (~3000 measured). */
  maxRunCanyonNodes: 4500
} as const;

export interface Diagnosis {
  category?: string;
  confidence?: number;
  reason?: string;
  repairable?: boolean;
}

export interface VerdictView {
  tone: 'error' | 'repaired' | 'guarded';
  mark: Status;
  headline: string;
  category?: string;
  note: string;
  done: boolean; // true once the verdict is final (drives the sunset reveal)
}

/** One side of the judgment ledger: a single call (repaired / refused) with the
 *  REAL reasoning + evidence that produced it, pulled straight from the events. */
export interface JudgmentCall {
  kind: 'repaired' | 'refused';
  category?: string;
  title: string;
  verdict: string; // the short stamp word: "auto-repaired" / "refused"
  reason?: string; // the diagnosis reasoning (real model/heuristic text)
  detail?: string; // the repair reasoning, when present
  diff?: string;
  before?: string;
  after?: string;
}

/** Resolve the run's overall verdict shape from its events, or null until there is
 *  enough signal (a diagnosis, a repair, or a decision) to call one. */
export function deriveVerdict(events: PipelineEvent[]) {
  const diagnoses = events
    .filter((e) => e.stage === 'diagnose' && e.data?.diagnosis)
    .map((e) => e.data!.diagnosis as Diagnosis);
  const regression = diagnoses.find((d) => d.category === 'PRODUCT_REGRESSION');
  const repairEvent = events.find((e) => e.stage === 'repair');
  const repairApplied = repairEvent ? repairEvent.status === 'pass' : false;
  const repairRefused = repairEvent?.status === 'info';
  const decision = events.find((e) => e.stage === 'decision' && e.status !== 'start');

  if (!decision && !repairEvent && diagnoses.length === 0) {
    return null;
  }
  return {
    category: regression?.category ?? diagnoses[0]?.category,
    repairApplied,
    repairRefused,
    failed: decision?.status === 'fail',
    done: Boolean(decision)
  };
}

/**
 * Gather the two contrasting judgments (safe drift -> repaired, real regression
 * -> refused) WITH their evidence from the live pipeline events, so the verdict
 * moment surfaces the *why* — not just a status word. All fields are real:
 *  - diagnose rows carry the diagnosis (category, reason, repairable, confidence)
 *  - the repair row carries diff + reason + before/after screenshots
 */
export function collectJudgments(events: PipelineEvent[]): JudgmentCall[] {
  const calls: JudgmentCall[] = [];
  const diagnoses = events
    .filter((e) => e.stage === 'diagnose' && e.data?.diagnosis)
    .map((e) => e.data!.diagnosis as Diagnosis);
  const repair = events.find((e) => e.stage === 'repair' && e.status !== 'start');
  const repairApplied = repair?.status === 'pass';

  // Safe drift: the copy-change that was auto-repaired (or refused if no patch).
  const driftDiag = diagnoses.find((d) => d.repairable) ?? diagnoses.find((d) => d.category === 'UI_COPY_CHANGE');
  if (driftDiag || repair) {
    const rd = repair?.data ?? {};
    calls.push({
      kind: repairApplied ? 'repaired' : 'refused',
      category: driftDiag?.category,
      title: 'Safe drift',
      verdict: repairApplied ? 'auto-repaired' : 'left as-is',
      reason: driftDiag?.reason,
      detail: typeof rd.reason === 'string' ? rd.reason : undefined,
      diff: typeof rd.diff === 'string' ? rd.diff : undefined,
      before: typeof rd.beforeScreenshot === 'string' ? rd.beforeScreenshot : undefined,
      after: typeof rd.afterScreenshot === 'string' ? rd.afterScreenshot : undefined
    });
  }

  // Real regression: the call that was refused to avoid weakening the test.
  const regDiag = diagnoses.find((d) => d.category === 'PRODUCT_REGRESSION');
  if (regDiag) {
    calls.push({
      kind: 'refused',
      category: regDiag.category,
      title: 'Product regression',
      verdict: 'repair refused',
      reason: regDiag.reason
    });
  }
  return calls;
}

/** The concrete per-row datum chip surfaced on a strata FACE (confidence %,
 *  scenario + verdict, applied/refused), or null for in-flight / chrome rows. */
export function rowDatum(event: PipelineEvent): { text: string; kind: 'ok' | 'no' | 'neutral' } | null {
  if (event.status === 'start') return null;
  const data = event.data ?? {};
  const scenario = typeof data.scenario === 'string' ? data.scenario : undefined;
  const diagnosis = data.diagnosis as Diagnosis | undefined;

  if (event.stage === 'diagnose' && diagnosis) {
    const conf =
      typeof diagnosis.confidence === 'number'
        ? `${Math.round(diagnosis.confidence <= 1 ? diagnosis.confidence * 100 : diagnosis.confidence)}% conf`
        : undefined;
    const repair = diagnosis.repairable ? 'repairable' : 'repair refused';
    return {
      text: [conf, repair].filter(Boolean).join(' · '),
      kind: diagnosis.repairable ? 'ok' : 'no'
    };
  }
  if (event.stage === 'run') {
    const verdict = event.status === 'pass' ? 'pass' : event.status === 'fail' ? 'fail' : event.status;
    return {
      text: [scenario, verdict].filter(Boolean).join(' · '),
      kind: event.status === 'pass' ? 'ok' : event.status === 'fail' ? 'no' : 'neutral'
    };
  }
  if (event.stage === 'repair') {
    const applied = event.status === 'pass';
    return { text: applied ? 'applied' : 'refused', kind: applied ? 'ok' : 'no' };
  }
  return null;
}

/** Format a millisecond span as a compact elapsed clock (e.g. 0:04, 1:12). */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
