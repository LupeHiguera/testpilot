import { describe, expect, it } from 'vitest';
import { PERF_BUDGET, collectJudgments, deriveVerdict, fmtElapsed, rowDatum } from '../../ui/src/runModel.js';
import type { PipelineEvent, Stage, Status } from '../../ui/src/types.js';

let seq = 0;
function ev(stage: Stage, status: Status, data?: Record<string, unknown>): PipelineEvent {
  seq += 1;
  return { id: `e${seq}`, runId: 'r1', stage, status, label: `${stage} ${status}`, ts: seq * 1000, data };
}

describe('deriveVerdict', () => {
  it('returns null before any diagnosis / repair / decision', () => {
    expect(deriveVerdict([ev('spec', 'pass'), ev('observe', 'pass')])).toBeNull();
  });

  it('marks a repaired run as done + repairApplied', () => {
    const v = deriveVerdict([
      ev('diagnose', 'pass', { diagnosis: { category: 'UI_COPY_CHANGE', repairable: true } }),
      ev('repair', 'pass'),
      ev('decision', 'pass')
    ]);
    expect(v).toMatchObject({ category: 'UI_COPY_CHANGE', repairApplied: true, repairRefused: false, failed: false, done: true });
  });

  it('flags a refused regression as failed', () => {
    const v = deriveVerdict([
      ev('diagnose', 'pass', { diagnosis: { category: 'PRODUCT_REGRESSION', repairable: false } }),
      ev('repair', 'info'),
      ev('decision', 'fail')
    ]);
    expect(v).toMatchObject({ category: 'PRODUCT_REGRESSION', repairApplied: false, repairRefused: true, failed: true, done: true });
  });
});

describe('collectJudgments', () => {
  it('produces a repaired safe-drift card and a refused regression card with real evidence', () => {
    const calls = collectJudgments([
      ev('diagnose', 'pass', { diagnosis: { category: 'UI_COPY_CHANGE', repairable: true, reason: 'copy drifted' } }),
      ev('repair', 'pass', { reason: 'applied role locator', diff: '- old\n+ new', beforeScreenshot: 'b.png', afterScreenshot: 'a.png' }),
      ev('diagnose', 'pass', { diagnosis: { category: 'PRODUCT_REGRESSION', repairable: false, reason: 'flow broken' } })
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.find((c) => c.title === 'Safe drift')).toMatchObject({
      kind: 'repaired',
      verdict: 'auto-repaired',
      diff: '- old\n+ new',
      before: 'b.png',
      after: 'a.png'
    });
    expect(calls.find((c) => c.title === 'Product regression')).toMatchObject({
      kind: 'refused',
      verdict: 'repair refused',
      reason: 'flow broken'
    });
  });

  it('is empty when there is no diagnosis or repair', () => {
    expect(collectJudgments([ev('spec', 'pass'), ev('run', 'pass')])).toEqual([]);
  });
});

describe('rowDatum', () => {
  it('summarises a diagnose row with confidence + repairability', () => {
    expect(rowDatum(ev('diagnose', 'pass', { diagnosis: { confidence: 0.9, repairable: true } }))).toEqual({
      text: '90% conf · repairable',
      kind: 'ok'
    });
  });

  it('summarises a failed run row with its scenario', () => {
    expect(rowDatum(ev('run', 'fail', { scenario: 'login' }))).toEqual({ text: 'login · fail', kind: 'no' });
  });

  it('returns null for an in-flight (start) row', () => {
    expect(rowDatum(ev('run', 'start'))).toBeNull();
  });
});

describe('fmtElapsed', () => {
  it('formats sub-minute and multi-minute spans and clamps negatives', () => {
    expect(fmtElapsed(4000)).toBe('0:04');
    expect(fmtElapsed(72000)).toBe('1:12');
    expect(fmtElapsed(-50)).toBe('0:00');
  });
});

describe('PERF_BUDGET', () => {
  it('states a positive load + DOM budget the dashboard holds to', () => {
    expect(PERF_BUDGET.maxLoadMs).toBeGreaterThan(0);
    expect(PERF_BUDGET.maxDomNodes).toBeGreaterThan(0);
  });
});
