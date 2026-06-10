import { parseSpec } from '../spec/parseSpec.js';
import { Diagnosis, ModelClient, ObservationArtifacts, RepairProposal, RunResult, TestIntent, VisionDiagnosis } from '../core/types.js';
import { createPatch } from './createPatch.js';

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
  await expect(page).toHaveURL(/${pathRegexSource(intent.expectedPath)}/);
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
    // The fresh page observation the repair loop takes before proposing; the mock
    // grounds its repair in the CURRENT buttons so the fix is real, not hard-coded.
    observation?: ObservationArtifacts;
  }): Promise<RepairProposal> {
    // Prefer the fresh observation's buttons; fall back to the failure artifacts.
    const presentButtons = input.observation?.buttons ?? input.runResult.failureArtifacts?.buttons ?? [];
    const repair = widenSubmitLocator(input.testContent, presentButtons);
    return {
      category: input.diagnosis.category,
      reason: repair
        ? `Widen the brittle "${repair.oldLabel}" submit selector to a role locator that matches both the old label and the page's current "${repair.newLabel}" button, preserving the submit action and every assertion.`
        : 'No safe generated-test repair was found (the driven control could not be matched to a current button).',
      originalPath: input.testPath,
      proposedContent: repair ? repair.content : input.testContent,
      diff: repair ? createPatch(input.testPath, input.testContent, repair.content) : '',
      safeToApply: Boolean(repair)
    };
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Escape a URL path for use inside an emitted `/.../` regex literal. Every `/`
 *  must be escaped too — an unescaped one would terminate the literal early and
 *  make the generated test a syntax error (e.g. a multi-segment `/app/dashboard`). */
function pathRegexSource(routePath: string): string {
  return escapeForRegex(routePath).replaceAll('/', '\\/');
}

/**
 * Generalised safe repair for a relabelled submit control. Finds a
 * `getByRole('button', { name: 'OLD' })` the test DRIVES whose label is no longer
 * among the page's current buttons, and widens it to a role locator matching BOTH
 * the old label and the equivalent current button — so a copy change is repaired
 * on ANY flow, not just the login demo's `Sign in` -> `Log in`. The widened locator
 * still preserves the original label (in case it returns) and touches nothing else,
 * so validatePatch's assertion/route guards still hold. Returns null when no driven
 * control maps to a current button (no fabricated repair).
 */
function widenSubmitLocator(
  testContent: string,
  presentButtons: string[]
): { content: string; oldLabel: string; newLabel: string } | null {
  const present = presentButtons.map((button) => button.trim()).filter(Boolean);
  const presentLower = present.map((button) => button.toLowerCase());
  const locator = /getByRole\((['"])button\1,\s*\{\s*name:\s*(['"])([^'"]+)\2\s*\}\)/g;

  for (let match = locator.exec(testContent); match; match = locator.exec(testContent)) {
    const oldLabel = match[3];
    if (presentLower.includes(oldLabel.toLowerCase())) {
      continue; // the driven control is still on the page → not a relabel
    }
    // Candidates are current buttons the test does not already reference — a
    // label that appears in the test is some other control it drives, not the
    // relabelled one. Among those, prefer the label that reads most like the old
    // one, so a multi-button page maps "Sign in" → "Log in", not "Forgot password".
    const candidates = present.filter(
      (button) =>
        button.toLowerCase() !== oldLabel.toLowerCase() && !testContent.toLowerCase().includes(button.toLowerCase())
    );
    const newLabel = pickClosestLabel(oldLabel, candidates);
    if (!newLabel) {
      continue; // no current button to map the drifted label onto
    }
    const alternatives = [oldLabel, newLabel].map(escapeForRegex).join('|');
    const replacement = `getByRole('button', { name: /^(${alternatives})$/ })`;
    const content = testContent.slice(0, match.index) + replacement + testContent.slice(match.index + match[0].length);
    return { content, oldLabel, newLabel };
  }
  return null;
}

/** The candidate most similar to the old label by character-bigram overlap
 *  (Dice coefficient); ties keep page order. A zero score still wins when it is
 *  the only candidate — a lone remaining button is the relabel by elimination. */
function pickClosestLabel(oldLabel: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = bigramSimilarity(oldLabel.toLowerCase(), candidate.toLowerCase());
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function bigramSimilarity(a: string, b: string): number {
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  if (bigramsA.size === 0 || bigramsB.size === 0) {
    return a === b ? 1 : 0;
  }
  let shared = 0;
  for (const gram of bigramsA) {
    if (bigramsB.has(gram)) {
      shared += 1;
    }
  }
  return (2 * shared) / (bigramsA.size + bigramsB.size);
}

function bigrams(value: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < value.length - 1; i += 1) {
    grams.add(value.slice(i, i + 2));
  }
  return grams;
}
