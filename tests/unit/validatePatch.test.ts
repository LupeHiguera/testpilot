import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Diagnosis, RepairProposal } from '../../src/core/types.js';
import { validatePatch } from '../../src/repair/validatePatch.js';

const diagnosis: Diagnosis = {
  category: 'UI_COPY_CHANGE',
  confidence: 0.9,
  reason: 'copy changed',
  repairable: true
};

describe('validatePatch', () => {
  it('accepts a generated-test repair that preserves assertions', () => {
    const result = validatePatch(makeProposal(validContent()), diagnosis);

    expect(result.valid).toBe(true);
  });

  it('rejects repairs that remove the user assertion', () => {
    const result = validatePatch(makeProposal("import { test } from '@playwright/test';\ntest('x', async ({ page }) => { await page.goto('/login'); await expect(page).toHaveURL(/dashboard/); });"), diagnosis);

    expect(result.valid).toBe(false);
  });

  it('rejects product regression repairs', () => {
    const result = validatePatch(makeProposal(validContent()), {
      category: 'PRODUCT_REGRESSION',
      confidence: 0.9,
      reason: 'route broken',
      repairable: false
    });

    expect(result.valid).toBe(false);
  });
});

function makeProposal(proposedContent: string): RepairProposal {
  return {
    category: 'UI_COPY_CHANGE',
    reason: 'repair',
    originalPath: path.join(process.cwd(), 'tests', 'generated', 'login.spec.ts'),
    proposedContent,
    diff: 'diff --git a/login.spec.ts b/login.spec.ts',
    safeToApply: true
  };
}

function validContent() {
  return `import { expect, test } from '@playwright/test';
test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /^(Sign in|Log in)$/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('Welcome, Demo User')).toBeVisible();
});`;
}
