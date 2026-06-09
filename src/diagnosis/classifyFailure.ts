import fs from 'node:fs/promises';
import { Diagnosis, RunResult, TestIntent } from '../core/types.js';
import { deriveFailureSignals } from './failureSignals.js';

/**
 * Classify a failed run into a {@link FailureCategory}. The decision is driven by
 * the app-agnostic signals in {@link deriveFailureSignals} — the assertion that
 * failed and the controls the test actually reached for — rather than login-demo
 * string matching, so it generalises to any Playwright flow.
 *
 * It only ever loosens toward refusal: a category is repairable
 * (SELECTOR_DRIFT / UI_COPY_CHANGE) only on a strong, specific drift signal; a
 * failed URL/outcome assertion is always treated as the product not reaching its
 * end state (refused), and anything ambiguous falls through to UNKNOWN (refused).
 */
export async function classifyFailure(runResult: RunResult, intent: TestIntent): Promise<Diagnosis> {
  if (runResult.passed) {
    return {
      category: 'UNKNOWN',
      confidence: 1,
      reason: 'The test passed; no failure classification is needed.',
      repairable: false
    };
  }

  const output = `${runResult.stdout}\n${runResult.stderr}\n${runResult.error ?? ''}`;
  const artifacts = runResult.failureArtifacts;
  const dom = artifacts?.domPath ? await fs.readFile(artifacts.domPath, 'utf8').catch(() => '') : '';
  const signals = deriveFailureSignals(output, dom, artifacts, intent);

  // 1. The app never came up / rendered nothing to interact with.
  if (signals.connectionError || (!signals.pageHealthy && signals.timeoutOnly)) {
    return {
      category: 'APP_UNAVAILABLE',
      confidence: 0.9,
      reason: signals.connectionError
        ? 'The app could not be reached (connection error).'
        : 'The page rendered no interactive content before timing out.',
      repairable: false
    };
  }

  // 2. A network / API failure underneath the UI.
  if (signals.hasNetworkErrors || signals.networkConsoleError) {
    const detail = artifacts?.networkErrors.length ? `: ${artifacts.networkErrors.slice(0, 3).join('; ')}` : '';
    return {
      category: 'NETWORK_OR_API_FAILURE',
      confidence: 0.85,
      reason: `Network or API failures were observed${detail}.`,
      repairable: false
    };
  }

  // 3. Safe drift: a control the test DROVE was relabelled (the label changed, the
  //    flow did not). Only reachable on a control-lookup failure, never on a
  //    failed outcome assertion.
  if (signals.relabelledControl) {
    const lookedFor = signals.lookedForTexts[0];
    return {
      category: 'UI_COPY_CHANGE',
      confidence: 0.9,
      reason: `The test drove a "${lookedFor}" control that is no longer on the page, but the page exposes an equivalent control — the label changed, not the flow.`,
      repairable: true
    };
  }

  // 4. The flow did NOT reach its expected outcome on an otherwise healthy page —
  //    the product behaviour is broken (or test data / auth is wrong). Refuse so
  //    the test is never weakened to paper over a real regression.
  if (signals.outcomeAssertionFailed && signals.pageHealthy) {
    if (signals.authFailure) {
      return {
        category: 'AUTH_OR_TEST_DATA_FAILURE',
        confidence: 0.75,
        reason: 'The expected outcome was not reached and the failure points to authentication or test data, not safe UI drift.',
        repairable: false
      };
    }
    return {
      category: 'PRODUCT_REGRESSION',
      confidence: 0.82,
      reason: `The flow did not reach its expected outcome (${intent.expectedPath || 'the asserted end state'}); the product behaviour appears broken, so the test was not weakened.`,
      repairable: false
    };
  }

  // 5. A control lookup failed while the page still renders its controls — the
  //    selector drifted rather than the product breaking.
  if (signals.selectorDrift) {
    return {
      category: 'SELECTOR_DRIFT',
      confidence: 0.72,
      reason: 'A locator failed while the page still renders interactive controls — the selector drifted rather than the product breaking.',
      repairable: true
    };
  }

  // 6. Auth / test-data failure without a clear outcome assertion.
  if (signals.authFailure) {
    return {
      category: 'AUTH_OR_TEST_DATA_FAILURE',
      confidence: 0.7,
      reason: 'The failure points to authentication, credentials, or test data.',
      repairable: false
    };
  }

  // 7. Not enough evidence to repair safely.
  return {
    category: 'UNKNOWN',
    confidence: 0.5,
    reason: 'There is not enough evidence to attribute this failure to safe drift, so no repair is proposed.',
    repairable: false
  };
}
