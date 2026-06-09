import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startLiveServer } from '../../src/server/server.js';

// Boot the real live server on an ephemeral port and exercise its security guards
// over HTTP. These pin three properties: artifact path-traversal is refused, the
// mutating endpoints reject cross-origin (CSRF) requests, and oversized bodies are
// refused — while a same-origin request still reaches normal validation.
let server: Server;
let base: string;

beforeAll(async () => {
  server = startLiveServer(0);
  if (!server.listening) {
    await new Promise<void>((resolve) => server.once('listening', resolve));
  }
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe('live server security guards', () => {
  it('refuses to serve an artifact outside runs/ (path traversal)', async () => {
    // Percent-encoded dots survive URL normalisation, so the `..` reaches the
    // handler's resolve()+boundary check rather than being collapsed by the parser.
    const res = await fetch(`${base}/artifacts/%2e%2e%2f%2e%2e%2fpackage.json`);
    expect(res.status).toBe(403);
  });

  it('rejects a cross-origin mutation (CSRF)', async () => {
    const res = await fetch(`${base}/api/stories`, {
      method: 'POST',
      headers: { Origin: 'http://evil.example', 'Content-Type': 'application/json' },
      body: '{}'
    });
    expect(res.status).toBe(403);
  });

  it('lets a same-origin mutation through to validation', async () => {
    const res = await fetch(`${base}/api/stories`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: '__no_such_project__' })
    });
    // Past the origin guard, the handler rejects the unknown project — proving the
    // guard does not block legitimate local use.
    expect(res.status).toBe(400);
  });

  it('rejects an oversized request body', async () => {
    const big = 'x'.repeat(1_000_050);
    const res = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pad: big })
    });
    expect(res.status).toBe(413);
  });
});
