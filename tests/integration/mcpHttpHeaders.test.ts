import { describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTransport } from '../../src/mcp/client.js';

// End-to-end check that the `headers` on a remote (http) McpServerConfig actually ride
// on the outgoing request. We stand up a throwaway HTTP server that records the first
// request's headers and replies 400 — the MCP handshake fails (it isn't a real server),
// but by then the request has already arrived carrying our Authorization header.
describe('MCP HTTP transport auth headers', () => {
  it('attaches the configured headers to outgoing Streamable HTTP requests', async () => {
    let authHeader: string | undefined;
    let sawRequest = false;
    const server = http.createServer((req, res) => {
      sawRequest = true;
      authHeader = req.headers['authorization'];
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"error":"dummy server"}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;

    const transport = createTransport({
      transport: 'http',
      url: `http://127.0.0.1:${port}/mcp`,
      headers: { Authorization: 'Bearer integration-token' }
    });
    const client = new Client({ name: 'testpilot-test', version: '0.0.0' });

    // The dummy server can't complete the MCP handshake, so connect rejects — expected.
    await client.connect(transport).catch(() => undefined);
    await client.close().catch(() => undefined);
    await new Promise<void>((resolve) => server.close(() => resolve()));

    expect(sawRequest).toBe(true);
    expect(authHeader).toBe('Bearer integration-token');
  });
});
