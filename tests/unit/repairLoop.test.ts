import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generatedTestsDir } from '../../src/core/config.js';
import {
  ModelClient,
  ObservationArtifacts,
  RepairProposal,
  RunResult,
  TestIntent
} from '../../src/core/types.js';
import { runRepairLoop } from '../../src/repair/repairLoop.js';

// The loop runs the REAL diagnoseFailure (heuristic classifier) + validatePatch +
// applyRepair; only the browser-facing observe/runTest and the model client are
// faked, so these tests exercise the actual safety wiring without Playwright.

const testPath = path.join(generatedTestsDir, '__looptest__.spec.ts');

const intent: TestIntent = {
  name: 'login',
  route: '/login',
  credentials: { email: 'demo@example.com', password: 'pw' },
  expectedPath: '/dashboard',
  expectedText: 'Welcome, Demo User',
  submitText: 'Sign in',
  originalSpec: 'log in and see the dashboard'
};

const observation: ObservationArtifacts = {
  url: 'http://127.0.0.1:3000/login',
  title: 'Login',
  domPath: '',
  screenshotPath: '/tmp/after.png',
  consoleLogs: [],
  networkErrors: [],
  buttons: ['Log in'],
  inputs: []
};

beforeEach(async () => {
  await fs.mkdir(generatedTestsDir, { recursive: true });
  await fs.writeFile(testPath, validContent('// initial'), 'utf8');
});

afterEach(async () => {
  await fs.rm(testPath, { force: true });
});

describe('runRepairLoop', () => {
  it('re-observes and succeeds on a second attempt', async () => {
    let observeCalls = 0;
    let runCalls = 0;
    let proposeCalls = 0;
    const result = await runRepairLoop({
      testPath,
      intent,
      firstRun: failRun('UI_COPY_CHANGE'),
      client: fakeClient(async () => {
        proposeCalls += 1;
        return validProposal(`// attempt ${proposeCalls}`); // differs each call → no "no progress"
      }),
      observe: async () => {
        observeCalls += 1;
        return observation;
      },
      // attempt 1 re-run still fails (as a repairable selector drift), attempt 2 passes
      runTest: async () => {
        runCalls += 1;
        return runCalls === 1 ? failRun('SELECTOR_DRIFT') : passRun();
      },
      emit: () => {},
      maxAttempts: 2
    });

    expect(result.status).toBe('passing');
    expect(result.attempts).toHaveLength(2);
    expect(observeCalls).toBe(2); // re-observed before each proposal
    expect(proposeCalls).toBe(2);
    expect(runCalls).toBe(2);
    expect(result.attempts.every((a) => a.applied)).toBe(true);
  });

  it('stops at needs-review when a repair reveals a non-repairable regression', async () => {
    let proposeCalls = 0;
    let runCalls = 0;
    const result = await runRepairLoop({
      testPath,
      intent,
      firstRun: failRun('UI_COPY_CHANGE'),
      client: fakeClient(async () => {
        proposeCalls += 1;
        return validProposal(`// attempt ${proposeCalls}`);
      }),
      observe: async () => observation,
      // the first repair "works" mechanically but the re-run now reads as a real regression
      runTest: async () => {
        runCalls += 1;
        return failRun('PRODUCT_REGRESSION');
      },
      emit: () => {},
      maxAttempts: 2
    });

    expect(result.status).toBe('needs-review');
    expect(result.diagnosis.category).toBe('PRODUCT_REGRESSION');
    expect(proposeCalls).toBe(1); // never proposed a SECOND patch over the regression
    expect(runCalls).toBe(1);
    expect(result.attempts).toHaveLength(1);
  });

  it('stops when the model proposes no further progress', async () => {
    let proposeCalls = 0;
    let runCalls = 0;
    const result = await runRepairLoop({
      testPath,
      intent,
      firstRun: failRun('UI_COPY_CHANGE'),
      client: fakeClient(async () => {
        proposeCalls += 1;
        return validProposal('// identical'); // SAME content every call
      }),
      observe: async () => observation,
      runTest: async () => {
        runCalls += 1;
        return failRun('SELECTOR_DRIFT'); // still failing → loop would retry
      },
      emit: () => {},
      maxAttempts: 3
    });

    expect(result.status).toBe('needs-review');
    expect(proposeCalls).toBe(2); // attempt 1 applied, attempt 2 was identical → stop
    expect(runCalls).toBe(1);
    expect(result.attempts.at(-1)?.stoppedReason).toBe('no progress');
  });

  it('exhausts its attempt budget and escalates when repairs keep failing', async () => {
    let proposeCalls = 0;
    let runCalls = 0;
    const result = await runRepairLoop({
      testPath,
      intent,
      firstRun: failRun('UI_COPY_CHANGE'),
      client: fakeClient(async () => {
        proposeCalls += 1;
        return validProposal(`// attempt ${proposeCalls}`); // distinct each time → not "no progress"
      }),
      observe: async () => observation,
      runTest: async () => {
        runCalls += 1;
        return failRun('SELECTOR_DRIFT'); // still a repairable drift, but never passes
      },
      emit: () => {},
      maxAttempts: 2
    });

    expect(result.status).toBe('needs-review');
    expect(proposeCalls).toBe(2); // applied exactly maxAttempts patches
    expect(runCalls).toBe(2);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts.every((a) => a.applied && !a.passedAfter)).toBe(true);
  });

  it('refuses an invalid proposal without re-running', async () => {
    let runCalls = 0;
    const result = await runRepairLoop({
      testPath,
      intent,
      firstRun: failRun('UI_COPY_CHANGE'),
      client: fakeClient(async () => ({
        category: 'UI_COPY_CHANGE',
        reason: 'drops the route assertion',
        originalPath: testPath,
        // missing toHaveURL → validatePatch rejects
        proposedContent: "import { expect, test } from '@playwright/test';\ntest('x', async ({ page }) => { await expect(page.getByText('Welcome, Demo User')).toBeVisible(); });",
        diff: '--- a\n+++ b',
        safeToApply: true
      })),
      observe: async () => observation,
      runTest: async () => {
        runCalls += 1;
        return passRun();
      },
      emit: () => {},
      maxAttempts: 2
    });

    expect(result.status).toBe('needs-review');
    expect(result.repairApplied).toBe(false);
    expect(runCalls).toBe(0); // never applied/re-ran an unsafe patch
  });
});

// ---- fixtures -------------------------------------------------------------

function fakeClient(proposeRepair: ModelClient['proposeRepair']): ModelClient {
  return {
    parseSpec: async () => intent,
    generateTest: async () => validContent('// gen'),
    classifyScreenshot: async (i) => ({ category: i.heuristic.category, confidence: i.heuristic.confidence, reason: 'mock' }),
    proposeRepair
  };
}

/** A failing RunResult whose stdout mimics REAL Playwright output (it cites the
 *  failing locator / assertion the way Playwright does) + artifacts, steering the
 *  real heuristic classifier to the requested category. */
function failRun(target: 'UI_COPY_CHANGE' | 'SELECTOR_DRIFT' | 'PRODUCT_REGRESSION'): RunResult {
  const base = { passed: false as const, testPath, runDir: '/tmp/run' };
  const artifacts = (buttons: string[]): ObservationArtifacts => ({
    url: 'u', title: 't', domPath: '', screenshotPath: '/tmp/fail.png', consoleLogs: [], networkErrors: [], buttons, inputs: []
  });
  if (target === 'UI_COPY_CHANGE') {
    // The driven control's label changed: lookup of 'Sign in' times out, page shows 'Log in'.
    const stdout = "locator.click: Timeout 30000ms exceeded.\nCall log: waiting for getByRole('button', { name: 'Sign in' })";
    return { ...base, stdout, stderr: '', failureArtifacts: artifacts(['Log in']) };
  }
  if (target === 'PRODUCT_REGRESSION') {
    // The flow never reaches /dashboard: the URL assertion fails on a healthy page.
    const stdout = 'Error: expect(page).toHaveURL(expected) failed\nExpected pattern: /dashboard/\nReceived string: http://127.0.0.1:3000/login\nTimeout 5000ms exceeded';
    return { ...base, stdout, stderr: '', failureArtifacts: artifacts(['Submit']) };
  }
  // SELECTOR_DRIFT: a non-textual locator fails while the page still renders controls.
  const stdout = "locator.click: Timeout 30000ms exceeded.\nCall log: waiting for locator('#submit-btn')";
  return { ...base, stdout, stderr: '', failureArtifacts: artifacts(['Submit']) };
}

function passRun(): RunResult {
  return { passed: true, testPath, runDir: '/tmp/run', stdout: 'ok', stderr: '' };
}

function validProposal(marker: string): RepairProposal {
  return {
    category: 'UI_COPY_CHANGE',
    reason: 'role locator that matches old and new label',
    originalPath: testPath,
    proposedContent: validContent(marker),
    diff: `--- a\n+++ b\n${marker}`,
    safeToApply: true
  };
}

function validContent(marker: string) {
  return `import { expect, test } from '@playwright/test';
${marker}
test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /^(Sign in|Log in)$/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('Welcome, Demo User')).toBeVisible();
});`;
}
