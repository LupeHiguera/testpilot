import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ObservationArtifacts } from '../core/types.js';
import { captureControls } from './captureControls.js';

export async function observePage(baseUrl: string, route: string, runDir: string): Promise<ObservationArtifacts> {
  await fs.mkdir(runDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleLogs: string[] = [];
  const networkErrors: string[] = [];

  page.on('console', (message) => consoleLogs.push(`${message.type()}: ${message.text()}`));
  page.on('requestfailed', (request) => networkErrors.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? 'failed'}`));

  try {
    await page.goto(resolveRoute(baseUrl, route), { waitUntil: 'domcontentloaded', timeout: 10_000 });
    const domPath = path.join(runDir, 'dom.html');
    const screenshotPath = path.join(runDir, 'screenshot.png');
    await fs.writeFile(domPath, await page.content(), 'utf8');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const { buttons, links, inputs } = await captureControls(page);

    return {
      url: page.url(),
      title: await page.title(),
      domPath,
      screenshotPath,
      consoleLogs,
      networkErrors,
      buttons,
      links,
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
