import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { collectFailureArtifacts } from '../browser/collectArtifacts.js';
import { createRunDir, projectRoot } from '../core/config.js';
import { RunResult } from '../core/types.js';

export async function runPlaywrightTest(input: {
  testPath: string;
  baseUrl: string;
  route: string;
  variant?: string;
  /** Root of the connected repo the test belongs to. When it is not testpilot's
   *  own tree, the run happens INSIDE that repo (cwd) with the repo's own
   *  Playwright install and config — mixing testpilot's runner with the repo's
   *  `@playwright/test` would load the library twice and crash. */
  repoRoot?: string;
}): Promise<RunResult> {
  const runDir = createRunDir('run');
  await fs.mkdir(runDir, { recursive: true });
  const env = {
    ...process.env,
    BASE_URL: input.baseUrl,
    DEMO_VARIANT: input.variant ?? ''
  };
  const repoRoot = path.resolve(input.repoRoot ?? projectRoot);
  const external = repoRoot !== projectRoot;
  const testPath = path.relative(repoRoot, path.resolve(input.testPath)).replaceAll(path.sep, '/');
  const args = external
    ? // The connected repo's own toolchain: its playwright, its config (or
      // Playwright defaults rooted at the repo when it has none).
      ['playwright', 'test', testPath, '--output', runDir]
    : ['playwright', 'test', testPath, '--config', path.join(projectRoot, 'playwright.config.ts'), '--output', runDir];
  const result = await runCommand('npx', args, env, repoRoot);
  const passed = result.code === 0;
  const runResult: RunResult = {
    passed,
    testPath: input.testPath,
    runDir,
    stdout: result.stdout,
    stderr: result.stderr,
    error: passed ? undefined : result.stderr || result.stdout
  };

  if (!passed) {
    try {
      runResult.failureArtifacts = await collectFailureArtifacts(input.baseUrl, input.route, runDir);
    } catch (error) {
      runResult.error = `${runResult.error ?? ''}\nArtifact collection failed: ${String(error)}`.trim();
    }
  }

  await fs.writeFile(path.join(runDir, 'run-result.json'), JSON.stringify(runResult, null, 2), 'utf8');
  return runResult;
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string = projectRoot) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawnCommand(command, args, {
      cwd,
      env,
      shell: false
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function spawnCommand(command: string, args: string[], options: Parameters<typeof spawn>[2]) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', command, ...args], options);
  }
  return spawn(command, args, options);
}
