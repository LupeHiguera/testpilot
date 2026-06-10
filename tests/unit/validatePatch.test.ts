import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Diagnosis, RepairProposal, TestIntent } from '../../src/core/types.js';
import { validatePatch } from '../../src/repair/validatePatch.js';

const diagnosis: Diagnosis = {
  category: 'UI_COPY_CHANGE',
  confidence: 0.9,
  reason: 'copy changed',
  repairable: true
};

const loginIntent: TestIntent = {
  name: 'login',
  route: '/login',
  credentials: { email: 'a@b.c', password: 'pw' },
  expectedPath: '/dashboard',
  expectedText: 'Welcome, Demo User',
  submitText: 'Sign in',
  originalSpec: 'login'
};

describe('validatePatch', () => {
  it('accepts a repair that preserves the route + outcome assertions', () => {
    expect(validatePatch(makeProposal(loginContent()), diagnosis, loginIntent).valid).toBe(true);
  });

  it('rejects a repair that drops the expected-outcome assertion', () => {
    const content = "import { test, expect } from '@playwright/test';\ntest('x', async ({ page }) => { await page.goto('/login'); await expect(page).toHaveURL(/dashboard/); });";
    expect(validatePatch(makeProposal(content), diagnosis, loginIntent).valid).toBe(false);
  });

  it('rejects a repair that drops the expected route', () => {
    // has toHaveURL + the outcome text, but no longer targets /dashboard
    const content = "import { test, expect } from '@playwright/test';\ntest('x', async ({ page }) => { await expect(page).toHaveURL(/elsewhere/); await expect(page.getByText('Welcome, Demo User')).toBeVisible(); });";
    expect(validatePatch(makeProposal(content), diagnosis, loginIntent).valid).toBe(false);
  });

  it('finds a multi-segment expected route escaped inside a regex literal', () => {
    const intent: TestIntent = { ...loginIntent, expectedPath: '/app/dashboard' };
    const content = `import { expect, test } from '@playwright/test';
test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/app\\/dashboard/);
  await expect(page.getByText('Welcome, Demo User')).toBeVisible();
});`;
    expect(validatePatch(makeProposal(content), diagnosis, intent).valid).toBe(true);
  });

  it('rejects product regression repairs regardless of content', () => {
    const result = validatePatch(makeProposal(loginContent()), {
      category: 'PRODUCT_REGRESSION',
      confidence: 0.9,
      reason: 'route broken',
      repairable: false
    }, loginIntent);
    expect(result.valid).toBe(false);
  });

  // Connected repos: the boundary can be rooted at the project's own tests dir,
  // but stays a strict tests-dir containment — never the repo root.
  describe('allowedTestsRoot (connected repos)', () => {
    const repoRoot = path.join(path.parse(process.cwd()).root, 'connected-repo');
    const testsRoot = path.join(repoRoot, 'e2e');

    function proposalAt(originalPath: string): RepairProposal {
      return { ...makeProposal(loginContent()), originalPath };
    }

    it('accepts a repair inside the connected tests dir', () => {
      const result = validatePatch(proposalAt(path.join(testsRoot, 'login.spec.ts')), diagnosis, loginIntent, {
        allowedTestsRoot: testsRoot
      });
      expect(result.valid).toBe(true);
    });

    it('refuses a path outside the tests dir (application code)', () => {
      const result = validatePatch(proposalAt(path.join(repoRoot, 'src', 'app.ts')), diagnosis, loginIntent, {
        allowedTestsRoot: testsRoot
      });
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('generated tests');
    });

    it('refuses a sibling dir that merely shares the prefix', () => {
      const result = validatePatch(proposalAt(path.join(repoRoot, 'e2e-evil', 'login.spec.ts')), diagnosis, loginIntent, {
        allowedTestsRoot: testsRoot
      });
      expect(result.valid).toBe(false);
    });

    it('still refuses connected-repo paths under the default root', () => {
      // Without an explicit root the boundary remains testpilot's tests/generated.
      const result = validatePatch(proposalAt(path.join(testsRoot, 'login.spec.ts')), diagnosis, loginIntent);
      expect(result.valid).toBe(false);
    });
  });

  // The point of the generalization: the guard protects an arbitrary flow, not just login.
  it('protects a non-login (checkout) flow via the intent', () => {
    const checkoutIntent: TestIntent = {
      name: 'checkout',
      route: '/cart',
      credentials: { email: 'a@b.c', password: 'pw' },
      expectedPath: '/confirmation',
      expectedText: 'Order placed',
      submitText: 'Place order',
      originalSpec: 'checkout'
    };
    const good = checkoutContent('Place order', '/confirmation', 'Order placed');
    expect(validatePatch(makeProposal(good), diagnosis, checkoutIntent).valid).toBe(true);
    // a repair that quietly drops the "Order placed" outcome is refused
    const weakened = checkoutContent('Buy now', '/confirmation', 'Thanks');
    expect(validatePatch(makeProposal(weakened), diagnosis, checkoutIntent).valid).toBe(false);
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

function loginContent() {
  return `import { expect, test } from '@playwright/test';
test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /^(Sign in|Log in)$/ }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText('Welcome, Demo User')).toBeVisible();
});`;
}

function checkoutContent(button: string, expectedPath: string, outcomeText: string) {
  return `import { expect, test } from '@playwright/test';
test('checkout', async ({ page }) => {
  await page.goto('/cart');
  await page.getByRole('button', { name: '${button}' }).click();
  await expect(page).toHaveURL(/${expectedPath.replace('/', '\\/')}/);
  await expect(page.getByText('${outcomeText}')).toBeVisible();
});`;
}
