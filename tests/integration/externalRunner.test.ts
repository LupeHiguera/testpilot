import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { projectRoot } from '../../src/core/config.js';
import { runPlaywrightTest } from '../../src/runner/runPlaywrightTest.js';

// Connected-repo runner support: a test outside testpilot's tree runs INSIDE the
// connected repo with the repo's own Playwright toolchain (cwd = repoRoot, no
// testpilot --config) — mixing testpilot's runner with the repo's own
// @playwright/test would load the library twice and crash. The spec is
// browserless so no Playwright browser install is needed; node_modules is linked
// so the repo "has" a Playwright install like a real connected repo.
describe('runPlaywrightTest with an external (connected-repo) test path', () => {
  let extRepo: string;

  beforeAll(async () => {
    extRepo = await fs.mkdtemp(path.join(os.tmpdir(), 'testpilot-ext-runner-'));
    await fs.mkdir(path.join(extRepo, 'e2e'), { recursive: true });
    await fs.writeFile(
      path.join(extRepo, 'e2e', 'smoke.spec.ts'),
      "import { test, expect } from '@playwright/test';\ntest('external smoke', () => {\n  expect(1 + 1).toBe(2);\n});\n",
      'utf8'
    );
    // 'junction' on Windows (no admin needed), plain symlink elsewhere.
    await fs.symlink(path.join(projectRoot, 'node_modules'), path.join(extRepo, 'node_modules'), 'junction');
  });

  afterAll(async () => {
    await fs.rm(extRepo, { recursive: true, force: true }).catch(() => {});
  });

  it('runs a test file outside the testpilot repo', { timeout: 120_000 }, async () => {
    const result = await runPlaywrightTest({
      testPath: path.join(extRepo, 'e2e', 'smoke.spec.ts'),
      baseUrl: 'http://127.0.0.1:9',
      route: '/',
      repoRoot: extRepo
    });
    expect(result.stdout + result.stderr).toContain('external smoke');
    expect(result.passed).toBe(true);
  });
});
