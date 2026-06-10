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
    // grounds its repair in the CURRENT controls so the fix is real, not hard-coded.
    observation?: ObservationArtifacts;
  }): Promise<RepairProposal> {
    // Prefer the fresh observation's controls; fall back to the failure artifacts.
    const present = input.observation ?? input.runResult.failureArtifacts;
    const repair = widenRelabeledLocator(input.testContent, {
      button: present?.buttons ?? [],
      link: present?.links ?? []
    });
    return {
      category: input.diagnosis.category,
      reason: repair
        ? `Widen the brittle "${repair.oldLabel}" ${repair.role} selector to a role locator that matches both the old label and the page's current "${repair.newLabel}" ${repair.role}, preserving the action and every assertion.`
        : 'No safe generated-test repair was found (the driven control could not be matched to a current control).',
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
 * Generalised safe repair for a relabelled control. Finds a
 * `getByRole('button'|'link', { name: 'OLD' })` the test DRIVES whose label is no
 * longer among the page's current controls OF THAT ROLE, and widens it to a role
 * locator matching BOTH the old label and the equivalent current control — so a
 * copy change is repaired on ANY flow (buttons and links alike), not just the
 * login demo's `Sign in` -> `Log in`. The widened locator still preserves the
 * original label (in case it returns) and touches nothing else, so validatePatch's
 * assertion/route guards still hold. Returns null when no driven control maps to a
 * current one (no fabricated repair).
 */
function widenRelabeledLocator(
  testContent: string,
  presentByRole: { button: string[]; link: string[] }
): { content: string; oldLabel: string; newLabel: string; role: 'button' | 'link' } | null {
  const locator = /getByRole\((['"])(button|link)\1,\s*\{\s*name:\s*(['"])([^'"]+)\3\s*\}\)/g;

  for (let match = locator.exec(testContent); match; match = locator.exec(testContent)) {
    const role = match[2] as 'button' | 'link';
    const oldLabel = match[4];
    // Candidates come from the SAME role: a vanished button is never mapped onto
    // a link (or vice versa) — that would change what the test drives.
    const present = presentByRole[role].map((label) => label.trim()).filter(Boolean);
    if (present.some((label) => label.toLowerCase() === oldLabel.toLowerCase())) {
      continue; // the driven control is still on the page → not a relabel
    }
    // Candidates are current controls the test does not already reference — a
    // label that appears in the test is some other control it drives, not the
    // relabelled one. Among those, prefer the label that reads most like the old
    // one, so a multi-control page maps "Sign in" → "Log in", not "Forgot password".
    const candidates = present.filter(
      (label) =>
        label.toLowerCase() !== oldLabel.toLowerCase() && !testContent.toLowerCase().includes(label.toLowerCase())
    );
    const newLabel = pickClosestLabel(oldLabel, candidates);
    if (!newLabel) {
      continue; // no current control to map the drifted label onto
    }
    const alternatives = [oldLabel, newLabel].map(escapeForRegex).join('|');
    const replacement = `getByRole('${role}', { name: /^(${alternatives})$/ })`;
    const content = testContent.slice(0, match.index) + replacement + testContent.slice(match.index + match[0].length);
    return { content, oldLabel, newLabel, role };
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
