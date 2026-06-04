import { parseSpec } from '../spec/parseSpec.js';
import { Diagnosis, ModelClient, ObservationArtifacts, RepairProposal, RunResult, TestIntent, VisionDiagnosis } from '../core/types.js';

export class MockModelClient implements ModelClient {
  async parseSpec(spec: string): Promise<TestIntent> {
    return parseSpec(spec);
  }

  async generateTest(intent: TestIntent, _observation: ObservationArtifacts): Promise<string> {
    return `import { expect, test } from '@playwright/test';

test('${intent.name}', async ({ page }) => {
  const target = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000');
  target.pathname = '${intent.route}';
  await page.goto(target.toString());
  await page.getByLabel('Email').fill('${intent.credentials.email}');
  await page.getByLabel('Password').fill('${intent.credentials.password}');
  await page.getByRole('button', { name: '${intent.submitText}' }).click();
  await expect(page).toHaveURL(/${intent.expectedPath.replace('/', '\\/')}/);
  await expect(page.getByText('${intent.expectedText}')).toBeVisible();
});
`;
  }

  async classifyScreenshot(input: {
    screenshotPath: string;
    intent: TestIntent;
    heuristic: Diagnosis;
  }): Promise<VisionDiagnosis> {
    // Deterministic: concur with the heuristic so mock runs stay reproducible.
    return {
      category: input.heuristic.category,
      confidence: input.heuristic.confidence,
      reason: 'Mock vision concurs with the heuristic classification.'
    };
  }

  async proposeRepair(input: {
    testPath: string;
    testContent: string;
    diagnosis: Diagnosis;
    runResult: RunResult;
    // Accepted for contract parity; the mock stays deterministic and does not
    // use the observation, so reproducible runs/CI are unaffected.
    observation?: ObservationArtifacts;
  }): Promise<RepairProposal> {
    const repaired = input.testContent.replace(
      /await page\.getByRole\('button', \{ name: 'Sign in' \}\)\.click\(\);/,
      "await page.getByRole('button', { name: /^(Sign in|Log in)$/ }).click();"
    );
    const changed = repaired !== input.testContent;
    return {
      category: input.diagnosis.category,
      reason: changed ? 'Replace brittle submit-button copy selector with a role locator that preserves the submit action.' : 'No safe generated-test repair was found.',
      originalPath: input.testPath,
      proposedContent: repaired,
      diff: changed ? createPatch(input.testPath, input.testContent, repaired) : '',
      safeToApply: changed
    };
  }
}

function createPatch(filePath: string, before: string, after: string) {
  return [
    `--- ${filePath}`,
    `+++ ${filePath} (repaired)`,
    '@@',
    ...before.split('\n').map((line) => `-${line}`),
    ...after.split('\n').map((line) => `+${line}`)
  ].join('\n');
}
