import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyFailure } from '../../src/diagnosis/classifyFailure.js';
import { collectLookedForTexts, deriveFailureSignals } from '../../src/diagnosis/failureSignals.js';
import { ObservationArtifacts, RunResult, TestIntent } from '../../src/core/types.js';

const intent: TestIntent = {
  name: 'login flow',
  route: '/login',
  credentials: { email: 'demo@example.com', password: 'password123' },
  expectedPath: '/dashboard',
  expectedText: 'Welcome, Demo User',
  submitText: 'Sign in',
  originalSpec: 'login spec'
};

describe('classifyFailure', () => {
  it('classifies equivalent button copy as UI_COPY_CHANGE', async () => {
    const result = await classifyFailure(makeRunResult("Timeout waiting for getByText('Sign in')", ['Log in']), intent);
    expect(result.category).toBe('UI_COPY_CHANGE');
    expect(result.repairable).toBe(true);
  });

  it('classifies URL assertion failure as product regression', async () => {
    const error = 'Error: expect(page).toHaveURL(expected) failed\nExpected pattern: /\\/dashboard/\nReceived string: "http://127.0.0.1:3000/login"';
    const result = await classifyFailure(makeRunResult(error, ['Sign in']), intent);
    expect(result.category).toBe('PRODUCT_REGRESSION');
    expect(result.repairable).toBe(false);
  });

  it('classifies a non-login button relabel as UI_COPY_CHANGE via the parsed locator', async () => {
    const checkoutIntent: TestIntent = { ...intent, name: 'checkout', submitText: 'Place order', expectedPath: '/confirmation', expectedText: 'Order placed' };
    const result = await classifyFailure(
      makeRunResult("Timeout waiting for getByRole('button', { name: 'Place order' })", ['Complete purchase']),
      checkoutIntent
    );
    expect(result.category).toBe('UI_COPY_CHANGE');
    expect(result.repairable).toBe(true);
  });

  it('detects a relabel from the FAILED locator even when it is not the intent.submitText', async () => {
    // The test drove a "Add to cart" control (parsed from the error); the intent's
    // submitText is something else entirely. Generalisation must key off the locator.
    const result = await classifyFailure(
      makeRunResult("locator.click: Timeout 30000ms exceeded.\nCall log: waiting for getByText('Add to cart')", ['Buy now']),
      { ...intent, submitText: 'Place order' }
    );
    expect(result.category).toBe('UI_COPY_CHANGE');
    expect(result.repairable).toBe(true);
  });

  it('classifies a relabelled LINK as UI_COPY_CHANGE (links count as present controls)', async () => {
    // The test drove a "View cart" link; the page now exposes a "Your basket"
    // link (and no buttons at all) — link capture must make this repairable.
    const result = await classifyFailure(
      makeRunResult("locator.click: Timeout 30000ms exceeded.\nCall log: waiting for getByRole('link', { name: 'View cart' })", [], {
        links: ['Your basket']
      }),
      { ...intent, name: 'cart', expectedPath: '/cart', expectedText: 'Your basket' }
    );
    expect(result.category).toBe('UI_COPY_CHANGE');
    expect(result.repairable).toBe(true);
  });

  it('classifies a failed CSS locator on a healthy page as SELECTOR_DRIFT', async () => {
    const result = await classifyFailure(
      makeRunResult("locator.click: Timeout 30000ms exceeded.\nCall log: waiting for locator('#submit-btn')", ['Sign in']),
      intent
    );
    expect(result.category).toBe('SELECTOR_DRIFT');
    expect(result.repairable).toBe(true);
  });

  // SAFETY INVARIANT: a missing OUTCOME (the expected greeting never appears) must
  // be refused as a regression — never mistaken for a repairable relabel just
  // because the asserted text is "absent" from the page.
  it('refuses a missing expected-outcome assertion as PRODUCT_REGRESSION', async () => {
    const error = "expect(locator).toBeVisible() failed\nLocator: getByText('Welcome, Demo User')\nTimeout 5000ms exceeded waiting for getByText('Welcome, Demo User')";
    const result = await classifyFailure(makeRunResult(error, ['Sign in']), intent);
    expect(result.category).toBe('PRODUCT_REGRESSION');
    expect(result.repairable).toBe(false);
  });

  it('classifies observed network failures as NETWORK_OR_API_FAILURE', async () => {
    const result = await classifyFailure(
      makeRunResult('Error: assertion failed', ['Sign in'], { networkErrors: ['GET http://app/api/data net::ERR_FAILED'] }),
      intent
    );
    expect(result.category).toBe('NETWORK_OR_API_FAILURE');
    expect(result.repairable).toBe(false);
  });

  it('classifies a connection error as APP_UNAVAILABLE', async () => {
    const result = await classifyFailure(
      makeRunResult('page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:3000/login', [], { inputs: [] }),
      intent
    );
    expect(result.category).toBe('APP_UNAVAILABLE');
    expect(result.repairable).toBe(false);
  });

  it('refuses an unrecognised failure as UNKNOWN', async () => {
    const result = await classifyFailure(makeRunResult('Error: expect(received).toBe(expected)\nExpected: 3\nReceived: 2', ['Sign in']), intent);
    expect(result.category).toBe('UNKNOWN');
    expect(result.repairable).toBe(false);
  });
});

describe('collectLookedForTexts', () => {
  it('parses control texts from the common locator forms', () => {
    expect(collectLookedForTexts("waiting for getByRole('button', { name: 'Sign in' })")).toEqual(['Sign in']);
    expect(collectLookedForTexts("getByLabel('Email') and getByText(\"Add to cart\")").sort()).toEqual(['Add to cart', 'Email']);
    expect(collectLookedForTexts("getByPlaceholder('Search products')")).toEqual(['Search products']);
  });
});

describe('deriveFailureSignals', () => {
  it('treats an outcome assertion as outcome-failed, not a control lookup', () => {
    const signals = deriveFailureSignals(
      "expect(locator).toBeVisible() failed waiting for getByText('Welcome, Demo User')",
      '',
      artifacts(['Sign in']),
      intent
    );
    expect(signals.failedMatcher).toBe('visibility');
    expect(signals.outcomeAssertionFailed).toBe(true);
    expect(signals.relabelledControl).toBe(false); // never a relabel — protects the regression path
  });
});

function artifacts(buttons: string[], extra: Partial<ObservationArtifacts> = {}): ObservationArtifacts {
  return {
    url: 'http://127.0.0.1:3000/login',
    title: 'testpilot demo',
    domPath: '',
    screenshotPath: '',
    consoleLogs: [],
    networkErrors: [],
    buttons,
    inputs: [],
    ...extra
  };
}

function makeRunResult(error: string, buttons: string[], extra: Partial<ObservationArtifacts> = {}): RunResult {
  return {
    passed: false,
    testPath: path.join(process.cwd(), 'tests', 'generated', 'login.spec.ts'),
    runDir: path.join(process.cwd(), 'runs', 'unit'),
    stdout: error,
    stderr: '',
    error,
    failureArtifacts: artifacts(buttons, extra)
  };
}
