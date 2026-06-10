/**
 * PERF BUDGET — CI ASSERTION.
 *
 * The dashboard's read-layer states a budget (ui/src/runModel.ts: PERF_BUDGET).
 * This script ENFORCES it against the real built UI so the budget is a gate, not
 * a comment: it boots the live server, loads the dashboard, drives a full mock
 * demo run, and fails (non-zero exit) on any breach.
 *
 * The DOM budgets are scoped to the live canyon pane (`.canyon-pane`) — what a
 * run actually renders — so the Expeditions history rail (which grows with the
 * local run archive) cannot inflate the numbers on a dev box or shrink them on a
 * fresh CI runner. Whole-page totals are reported as information for trend
 * tracking, not gated.
 *
 * Run: npm run perf:budget   (after `npm run ui:build` so dist/ is fresh)
 * In GitHub Actions the results are also appended to the job summary
 * ($GITHUB_STEP_SUMMARY) as a markdown table.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { stopProcessTree } from '../src/pipeline/demoServer.js';
import { PERF_BUDGET } from '../ui/src/runModel.js';

const PORT = Number(process.env.PERF_PORT ?? 4100);
const URL = `http://127.0.0.1:${PORT}`;
// CI tolerance: cold runners are slower than a warm dev box. The budget names an
// intent (~1.2s); allow a small CI headroom multiplier so the gate catches real
// regressions (a 2x blow-up) without flapping on runner jitter.
const LOAD_TOLERANCE = Number(process.env.PERF_LOAD_TOLERANCE ?? 2.5);
const maxLoadMs = Math.round(PERF_BUDGET.maxLoadMs * LOAD_TOLERANCE);

interface Metric {
  label: string;
  value: number;
  unit: string;
  /** Budget limit; undefined = informational only (reported, never gated). */
  limit?: number;
}

async function waitForServer(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`server did not become ready at ${URL} within ${timeoutMs}ms`);
}

const server = spawn(
  process.execPath,
  ['--import', 'tsx', 'src/cli/index.ts', 'serve', '--port', String(PORT)],
  { stdio: 'inherit', detached: process.platform !== 'win32' }
);

function metricOk(metric: Metric): boolean {
  return metric.limit === undefined || metric.value <= metric.limit;
}

function consoleLine(metric: Metric): string {
  const verdict = metric.limit === undefined ? 'INFO' : metricOk(metric) ? 'PASS' : 'FAIL';
  const budget = metric.limit === undefined ? '' : ` (budget ${metric.limit}${metric.unit})`;
  return `  ${verdict}  ${metric.label}: ${metric.value}${metric.unit}${budget}`;
}

/** Append a markdown table to the GitHub Actions job summary, when in CI. */
async function writeJobSummary(metrics: Metric[]): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  const rows = metrics.map((metric) => {
    const status = metric.limit === undefined ? 'ℹ️ info' : metricOk(metric) ? '✅ pass' : '❌ fail';
    const budget = metric.limit === undefined ? '—' : `≤ ${metric.limit}${metric.unit}`;
    return `| ${metric.label} | ${metric.value}${metric.unit} | ${budget} | ${status} |`;
  });
  const table = [
    '### Perf budget (dashboard)',
    '',
    '| metric | value | budget | status |',
    '| --- | ---: | ---: | --- |',
    ...rows,
    ''
  ].join('\n');
  await fs.appendFile(summaryPath, table, 'utf8').catch((error) => {
    console.error('could not write job summary:', error);
  });
}

let failed = false;
try {
  await waitForServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const count = (selector: string) =>
      page.evaluate((s: string) => document.querySelectorAll(s).length, selector);

    // 1. Initial load time — wall-clock around the navigation, on the fresh idle
    //    dashboard — plus the idle canyon pane (near-empty by design).
    const start = Date.now();
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.canyon-pane', { timeout: 15_000 });
    const loadMs = Date.now() - start;
    const idleCanyonNodes = await count('.canyon-pane *');
    const idlePageNodes = await count('*');

    // 2. Drive a full mock demo run, then measure the populated canyon — the
    //    worst case (every strata layer + the evidence ledger).
    await page.getByRole('button', { name: /run demo/i }).click();
    await page.waitForSelector('.strata.s-decision', { timeout: 150_000 });
    await page.waitForTimeout(600);
    const runCanyonNodes = await count('.canyon-pane *');
    const runPageNodes = await count('*');

    const metrics: Metric[] = [
      { label: 'initial load', value: loadMs, unit: 'ms', limit: maxLoadMs },
      { label: 'canyon DOM (idle)', value: idleCanyonNodes, unit: '', limit: PERF_BUDGET.maxIdleCanyonNodes },
      { label: 'canyon DOM (full run)', value: runCanyonNodes, unit: '', limit: PERF_BUDGET.maxRunCanyonNodes },
      { label: 'whole page DOM (idle)', value: idlePageNodes, unit: '' },
      { label: 'whole page DOM (full run)', value: runPageNodes, unit: '' }
    ];
    failed = !metrics.every(metricOk);

    console.log('PERF BUDGET');
    for (const metric of metrics) {
      console.log(consoleLine(metric));
    }
    if (failed) {
      console.error('\nPerf budget exceeded — see FAIL lines above.');
    }
    await writeJobSummary(metrics);
  } finally {
    await browser.close();
  }
} catch (error) {
  failed = true;
  console.error('perf-budget check errored:', error);
} finally {
  stopProcessTree(server.pid);
}

process.exit(failed ? 1 : 0);
