import fs from 'node:fs/promises';
import { Diagnosis, RunResult, TestIntent } from '../core/types.js';

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

  if (/ERR_CONNECTION|ECONNREFUSED|net::ERR/i.test(output) || (/timeout/i.test(output) && !dom && !artifacts?.buttons.length)) {
    return {
      category: 'APP_UNAVAILABLE',
      confidence: 0.9,
      reason: 'The app could not be reached reliably.',
      repairable: false
    };
  }

  if (artifacts?.networkErrors.length) {
    return {
      category: 'NETWORK_OR_API_FAILURE',
      confidence: 0.85,
      reason: `Network failures were observed: ${artifacts.networkErrors.join('; ')}`,
      repairable: false
    };
  }

  if (/getByText\('Sign in'|button.*Sign in|name: 'Sign in'|Sign in/i.test(output) && artifacts?.buttons.some((button) => button === 'Log in')) {
    return {
      category: 'UI_COPY_CHANGE',
      confidence: 0.9,
      reason: 'The generated test looked for the old submit text, but the page still exposes an equivalent login button.',
      repairable: true
    };
  }

  if (/toHaveURL|Expected pattern|expect\(page\)/i.test(output) && artifacts?.buttons.length) {
    return {
      category: 'PRODUCT_REGRESSION',
      confidence: 0.82,
      reason: `The test did not reach ${intent.expectedPath}, so the expected business outcome is not currently working.`,
      repairable: false
    };
  }

  if (/locator|strict mode|Timeout/i.test(output) && (dom.includes('button') || artifacts?.buttons.length)) {
    return {
      category: 'SELECTOR_DRIFT',
      confidence: 0.75,
      reason: 'The failure appears locator-related while the page still contains interactive controls.',
      repairable: true
    };
  }

  if (/password|credential|auth/i.test(output)) {
    return {
      category: 'AUTH_OR_TEST_DATA_FAILURE',
      confidence: 0.7,
      reason: 'The failure mentions credentials or authentication.',
      repairable: false
    };
  }

  return {
    category: 'UNKNOWN',
    confidence: 0.5,
    reason: 'There is not enough evidence to repair safely.',
    repairable: false
  };
}
