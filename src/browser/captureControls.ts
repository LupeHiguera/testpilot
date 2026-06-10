import type { Page } from '@playwright/test';

/**
 * Capture the interactive controls role-based locators reach for — shared by the
 * page observer and the failure-artifact collector so both see the same page.
 *
 * - `buttons`: everything `getByRole('button')` matches — <button>,
 *   [role=button], and submit/button inputs (whose accessible name is `value`).
 * - `links`: `getByRole('link')` targets (<a href>), capped so a nav-heavy page
 *   doesn't bloat the recorded artifacts.
 *
 * The accessible name is approximated as aria-label, else an input's value,
 * else the trimmed text content.
 */
export async function captureControls(page: Page): Promise<{
  buttons: string[];
  links: string[];
  inputs: Array<{ name: string; type: string; placeholder: string; label: string }>;
}> {
  const buttons = await page
    .locator('button, [role="button"], input[type="submit"], input[type="button"]')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const ariaLabel = element.getAttribute('aria-label');
          if (ariaLabel?.trim()) return ariaLabel.trim();
          if (element.tagName === 'INPUT') return (element as HTMLInputElement).value.trim();
          return element.textContent?.trim() ?? '';
        })
        .filter(Boolean)
    );

  const links = await page.locator('a[href]').evaluateAll((elements) =>
    elements
      .map((element) => (element.getAttribute('aria-label')?.trim() || element.textContent?.trim()) ?? '')
      .filter(Boolean)
      .slice(0, 100)
  );

  const inputs = await page.locator('input').evaluateAll((elements) =>
    elements.map((input) => ({
      name: input.getAttribute('name') ?? '',
      type: input.getAttribute('type') ?? '',
      placeholder: input.getAttribute('placeholder') ?? '',
      label: input.closest('label')?.textContent?.trim() ?? ''
    }))
  );

  return { buttons, links, inputs };
}
