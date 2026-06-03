import fs from 'node:fs/promises';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const gradingDir = path.join(process.cwd(), 'grading');

export interface CaptureResult {
  viewport: number;
  screenshotPath: string;
  base64: string;
}

/**
 * Screenshot the dashboard at a viewport. Optionally trigger a live run first and
 * wait for it to finish, so the captured canyon is populated rather than empty.
 */
export async function captureUi(options: {
  url: string;
  viewport?: number;
  triggerRun?: boolean;
  waitSelector?: string;
}): Promise<CaptureResult> {
  const viewport = options.viewport ?? 1440;
  await fs.mkdir(gradingDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: viewport, height: Math.round(viewport * 0.7) } });
    await page.goto(options.url, { waitUntil: 'domcontentloaded' });
    if (options.triggerRun) {
      await page.getByRole('button', { name: /run demo/i }).click().catch(() => {});
      await page.waitForSelector('.strata.s-decision', { timeout: 150_000 }).catch(() => {});
    }
    if (options.waitSelector) {
      await page.waitForSelector(options.waitSelector, { timeout: 30_000 }).catch(() => {});
    }
    await page.waitForTimeout(600);
    const screenshotPath = path.join(gradingDir, `viewport-${viewport}-${Date.now()}.png`);
    const buffer = await page.screenshot({ path: screenshotPath, fullPage: true });
    return { viewport, screenshotPath, base64: buffer.toString('base64') };
  } finally {
    await browser.close();
  }
}

export interface UiChecks {
  url: string;
  consoleErrors: string[];
  axeViolations: { id: string; impact: string | null; help: string; nodes: number }[];
  metrics: { loadMs: number; domNodes: number };
}

/** Objective robustness checks: console errors, axe-core a11y violations, basic metrics. */
export async function runUiChecks(url: string): Promise<UiChecks> {
  const browser = await chromium.launch();
  const consoleErrors: string[] = [];
  try {
    // axe-core/playwright requires a page created from an explicit context.
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    const start = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const loadMs = Date.now() - start;
    const domNodes = await page.evaluate(() => document.querySelectorAll('*').length);
    const axe = await new AxeBuilder({ page }).analyze();
    const axeViolations = axe.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      nodes: violation.nodes.length
    }));
    return { url, consoleErrors, axeViolations, metrics: { loadMs, domNodes } };
  } finally {
    await browser.close();
  }
}
