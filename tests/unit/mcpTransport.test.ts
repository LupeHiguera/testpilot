import { describe, expect, it } from 'vitest';
import { createTransport } from '../../src/mcp/client.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

// createTransport only builds the transport object — it does not open a connection or
// spawn a subprocess — so these assertions are side-effect free.
describe('createTransport', () => {
  it('defaults to stdio for a bare command config (back-compat)', () => {
    expect(createTransport({ command: 'node', args: ['server.js'] })).toBeInstanceOf(StdioClientTransport);
  });

  it('uses stdio when transport is explicitly "stdio"', () => {
    expect(createTransport({ transport: 'stdio', command: 'npx', args: ['-y', 'x'] })).toBeInstanceOf(
      StdioClientTransport
    );
  });

  it('uses Streamable HTTP for transport: "http"', () => {
    const transport = createTransport({
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer token' }
    });
    expect(transport).toBeInstanceOf(StreamableHTTPClientTransport);
  });

  it('uses SSE for transport: "sse"', () => {
    const transport = createTransport({
      transport: 'sse',
      url: 'https://mcp.example.com/sse',
      headers: { Authorization: 'Bearer token' }
    });
    expect(transport).toBeInstanceOf(SSEClientTransport);
  });
});
