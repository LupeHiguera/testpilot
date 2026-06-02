import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ObservationArtifacts } from '../core/types.js';

export async function collectFailureArtifacts(baseUrl: string, route: string, runDir: string): Promise<ObservationArtifacts> {
  await fs.mkdir(runDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleLogs: string[] = [];
  const networkErrors: string[] = [];

  page.on('console', (message) => consoleLogs.push(`${message.type()}: ${message.text()}`));
  page.on('requestfailed', (request) => networkErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`));

  try {
    await page.goto(resolveRoute(baseUrl, route), { waitUntil: 'domcontentloaded', timeout: 10_000 });
    const domPath = path.join(runDir, 'failure-dom.html');
    const screenshotPath = path.join(runDir, 'failure-screenshot.png');
    await fs.writeFile(domPath, await page.content(), 'utf8');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const buttons = await page.locator('button').evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? '').filter(Boolean));
    const inputs = await page.locator('input').evaluateAll((inputs) =>
      inputs.map((input) => ({
        name: input.getAttribute('name') ?? '',
        type: input.getAttribute('type') ?? '',
        placeholder: input.getAttribute('placeholder') ?? '',
        label: input.closest('label')?.textContent?.trim() ?? ''
      }))
    );

    return {
      url: page.url(),
      title: await page.title(),
      domPath,
      screenshotPath,
      consoleLogs,
      networkErrors,
      buttons,
      inputs
    };
  } finally {
    await browser.close();
  }
}

function resolveRoute(baseUrl: string, route: string) {
  const url = new URL(baseUrl);
  url.pathname = route;
  return url.toString();
}
