import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockModelClient } from '../../src/generator/mockClient.js';
import { Diagnosis, ObservationArtifacts, RunResult, TestIntent } from '../../src/core/types.js';

const client = new MockModelClient();
const diagnosis: Diagnosis = { category: 'UI_COPY_CHANGE', confidence: 0.9, reason: 'copy changed', repairable: true };
const runResult: RunResult = { passed: false, testPath: 'flow.spec.ts', runDir: 'runs/unit', stdout: '', stderr: '' };

function observation(buttons: string[]): ObservationArtifacts {
  return { url: 'u', title: 't', domPath: '', screenshotPath: '', consoleLogs: [], networkErrors: [], buttons, inputs: [] };
}

/** A generated test that drives `submitLabel` and asserts a route + outcome. */
function testFor(submitLabel: string): string {
  return `import { expect, test } from '@playwright/test';
test('flow', async ({ page }) => {
  await page.goto('/x');
  await page.getByRole('button', { name: '${submitLabel}' }).click();
  await expect(page).toHaveURL(/\\/done/);
  await expect(page.getByText('Done')).toBeVisible();
});`;
}

describe('MockModelClient.generateTest', () => {
  it('emits a valid URL regex for a multi-segment expected path', async () => {
    const intent: TestIntent = {
      name: 'flow',
      route: '/login',
      credentials: { email: 'a@b.c', password: 'pw' },
      expectedPath: '/app/dashboard',
      expectedText: 'Welcome',
      submitText: 'Sign in',
      originalSpec: 'spec'
    };
    const content = await client.generateTest(intent, observation([]));

    // Every slash is escaped; an unescaped one would end the regex literal early
    // and make the generated file a syntax error.
    expect(content).toContain('toHaveURL(/\\/app\\/dashboard/)');
    const literal = content.match(/toHaveURL\(\/(.+)\/\)/)?.[1];
    expect(literal).toBeDefined();
    expect(new RegExp(literal!).test('http://127.0.0.1:3000/app/dashboard')).toBe(true);
  });
});

describe('MockModelClient.proposeRepair', () => {
  it('widens the submit selector to match the old and current label (login demo case)', async () => {
    const proposal = await client.proposeRepair({
      testPath: path.join(process.cwd(), 'tests', 'generated', 'login.spec.ts'),
      testContent: testFor('Sign in'),
      diagnosis,
      runResult,
      observation: observation(['Log in'])
    });

    expect(proposal.safeToApply).toBe(true);
    expect(proposal.proposedContent).toContain("getByRole('button', { name: /^(Sign in|Log in)$/ })");
    // Every assertion survives, so validatePatch will accept it.
    expect(proposal.proposedContent).toContain('toHaveURL');
    expect(proposal.proposedContent).toContain("getByText('Done')");
  });

  it('generalises to a non-login relabel (Place order -> Complete purchase)', async () => {
    const proposal = await client.proposeRepair({
      testPath: 'checkout.spec.ts',
      testContent: testFor('Place order'),
      diagnosis,
      runResult,
      observation: observation(['Complete purchase'])
    });

    expect(proposal.safeToApply).toBe(true);
    expect(proposal.proposedContent).toContain('/^(Place order|Complete purchase)$/');
  });

  it('grounds the new label in real observed buttons, not a hard-coded string', async () => {
    const proposal = await client.proposeRepair({
      testPath: 'x.spec.ts',
      testContent: testFor('Add to cart'),
      diagnosis,
      runResult,
      observation: observation(['Buy now'])
    });

    expect(proposal.proposedContent).toContain('/^(Add to cart|Buy now)$/');
    expect(proposal.proposedContent).not.toContain('Log in'); // nothing login-specific leaked
  });

  it('proposes no repair when no current button maps to the driven control', async () => {
    const proposal = await client.proposeRepair({
      testPath: 'x.spec.ts',
      testContent: testFor('Sign in'),
      diagnosis,
      runResult,
      observation: observation([]) // nothing on the page to map the drifted label onto
    });

    expect(proposal.safeToApply).toBe(false);
    expect(proposal.proposedContent).toBe(testFor('Sign in')); // unchanged — no fabricated repair
  });
});
