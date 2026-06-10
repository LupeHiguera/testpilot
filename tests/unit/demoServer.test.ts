import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { waitForServer } from '../../src/pipeline/demoServer.js';

let server: http.Server | undefined;

function listen(handler: http.RequestListener): Promise<string> {
  server = http.createServer(handler);
  return new Promise((resolve) => {
    server!.listen(0, '127.0.0.1', () => {
      const { port } = server!.address() as AddressInfo;
      resolve(`http://127.0.0.1:${port}/`);
    });
  });
}

afterEach(() => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())));

describe('waitForServer', () => {
  it('resolves once the server responds ok', async () => {
    const url = await listen((_req, res) => res.end('ok'));
    await expect(waitForServer(url, 2_000)).resolves.toBeUndefined();
  });

  it('backs off between attempts instead of hot-looping on non-ok responses', async () => {
    let hits = 0;
    const url = await listen((_req, res) => {
      hits += 1;
      res.statusCode = 500;
      res.end('boom');
    });
    await expect(waitForServer(url, 1_000)).rejects.toThrow(/Timed out/);
    // With the 300ms backoff a 1s deadline allows a handful of attempts; without
    // it (the regression this pins) the loop fires hundreds of requests.
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(10);
  });
});
