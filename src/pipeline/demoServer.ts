import { spawn } from 'node:child_process';
import { defaultBaseUrl, projectRoot } from '../core/config.js';

export function withVariant(baseUrl: string, variant?: string): string {
  if (!variant) {
    return baseUrl;
  }
  const url = new URL(baseUrl);
  url.searchParams.set('variant', variant);
  return url.toString();
}

export async function startDemoServer() {
  const child = spawnCommand('npx', ['vite', '--host', '127.0.0.1', '--port', '3000'], {
    cwd: projectRoot,
    shell: false,
    // No pipes to read keeps the event loop from being held open, and a detached
    // process group (POSIX) lets us kill vite and its children together.
    stdio: 'ignore',
    detached: process.platform !== 'win32'
  });
  // The server's lifecycle is managed explicitly by stopProcessTree; never let it
  // keep the process alive on its own (which would hang the CLI in CI).
  child.unref();
  await waitForServer(defaultBaseUrl);
  return child;
}

export async function waitForServer(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Not accepting connections yet.
    }
    // Back off on EVERY failed attempt — a server that answers non-ok (e.g. a
    // crashing 500) would otherwise be hammered in a tight loop until the deadline.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for demo server at ${url}`);
}

export function stopProcessTree(pid: number | undefined) {
  if (!pid) {
    return;
  }
  if (process.platform === 'win32') {
    spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  // Kill the whole process group (vite + its children), not just the npx wrapper.
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already exited.
    }
  }
}

function spawnCommand(command: string, args: string[], options: Parameters<typeof spawn>[2]) {
  if (process.platform === 'win32') {
    return spawn('cmd.exe', ['/c', command, ...args], options);
  }
  return spawn(command, args, options);
}
