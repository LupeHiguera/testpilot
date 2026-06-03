import { expect, test } from '@playwright/test';

test('login flow', async ({ page }) => {
  const target = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000');
  target.pathname = '/login';
  await page.goto(target.toString());
  await page.getByLabel('Email').fill('demo@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: /^(Sign in|Log in)$/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Welcome, Demo User')).toBeVisible();
});
