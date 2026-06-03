import { describe, expect, it } from 'vitest';
import { TestIntent } from '../../src/core/types.js';
import { validateGeneratedTest } from '../../src/generator/validateGeneratedTest.js';

const intent: TestIntent = {
  name: 'login flow',
  route: '/login',
  credentials: { email: 'demo@example.com', password: 'password123' },
  expectedPath: '/dashboard',
  expectedText: 'Welcome, Demo User',
  submitText: 'Sign in',
  originalSpec: 'log in and see the dashboard'
};

function validContent() {
  return `import { expect, test } from '@playwright/test';
test('login flow', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/login');
  await page.getByLabel('Email').fill('demo@example.com');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/dashboard/);
  await expect(page.getByText('Welcome, Demo User')).toBeVisible();
});`;
}

describe('validateGeneratedTest', () => {
  it('accepts a structurally sound test that preserves intent', () => {
    expect(validateGeneratedTest(validContent(), intent).valid).toBe(true);
  });

  it('rejects empty output', () => {
    expect(validateGeneratedTest('   ', intent).valid).toBe(false);
  });

  it('rejects markdown-fenced output', () => {
    expect(validateGeneratedTest('```ts\n' + validContent() + '\n```', intent).valid).toBe(false);
  });

  it('rejects output with no assertions', () => {
    const noAssertions = validContent().replace(/await expect[^;]*;/g, '');
    expect(validateGeneratedTest(noAssertions, intent).valid).toBe(false);
  });

  it('rejects focus/skip markers', () => {
    const onlyTest = validContent().replace("test('login flow'", "test.only('login flow'");
    expect(validateGeneratedTest(onlyTest, intent).valid).toBe(false);
  });

  it('rejects a test that dropped the expected outcome text', () => {
    const dropped = validContent().replace('Welcome, Demo User', 'Some other text');
    expect(validateGeneratedTest(dropped, intent).valid).toBe(false);
  });

  it('rejects a test that does not import from @playwright/test', () => {
    const noImport = validContent().replace(/import .*@playwright\/test.*;\n/, '');
    expect(validateGeneratedTest(noImport, intent).valid).toBe(false);
  });
});
