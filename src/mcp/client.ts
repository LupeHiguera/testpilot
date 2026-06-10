import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** Launch a LOCAL MCP server over stdio — testpilot spawns it as a child process.
 *  `transport` is optional and defaults to 'stdio' so existing `{ command, ... }`
 *  configs keep working unchanged. */
export interface McpStdioConfig {
  transport?: 'stdio';
  command: string;
  args?: string[];
  /** Extra env vars (e.g. a token) merged over the inherited environment. */
  env?: Record<string, string>;
}

/** Connect to a REMOTE MCP server over HTTP. Use 'http' for the modern Streamable
 *  HTTP transport (preferred); use 'sse' only for legacy Server-Sent-Events servers
 *  that haven't migrated yet. Auth is a static header (e.g. a bearer token). */
export interface McpHttpConfig {
  transport: 'http' | 'sse';
  /** The MCP endpoint URL, e.g. https://mcp.atlassian.com/v1/sse. */
  url: string;
  /** Static headers attached to every request, e.g. { Authorization: `Bearer ${token}` }. */
  headers?: Record<string, string>;
}

export type McpServerConfig = McpStdioConfig | McpHttpConfig;

/** Narrow to the remote-HTTP shape (vs a stdio subprocess). */
function isHttpConfig(config: McpServerConfig): config is McpHttpConfig {
  return config.transport === 'http' || config.transport === 'sse';
}

/** Build the right MCP transport for a config: a stdio subprocess, Streamable HTTP, or
 *  legacy SSE. For HTTP/SSE the configured headers are attached to every request (and,
 *  for SSE, to the GET that opens the event stream, so auth covers the whole session).
 *  Exported for unit testing; constructing a transport does NOT open a connection. */
export function createTransport(config: McpServerConfig) {
  if (isHttpConfig(config)) {
    const url = new URL(config.url);
    if (config.transport === 'sse') {
      return new SSEClientTransport(url, {
        // POSTs (sending messages) carry the headers...
        requestInit: { headers: config.headers },
        // ...and so does the initial GET that opens the SSE stream.
        eventSourceInit: {
          fetch: (input, init) => fetch(input, { ...init, headers: { ...init?.headers, ...config.headers } })
        }
      });
    }
    return new StreamableHTTPClientTransport(url, { requestInit: { headers: config.headers } });
  }
  return new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: inheritedEnv(config.env)
  });
}

/** Connect to an MCP server (stdio subprocess or remote HTTP/SSE), run `fn`, and always
 *  close the connection. */
export async function withMcpClient<T>(config: McpServerConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = createTransport(config);
  const client = new Client({ name: 'testpilot', version: '0.1.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

/** Call a tool and return the concatenated text content. A tool-level error
 *  (isError — e.g. a 401/404 from a private repo or a bad token) is THROWN with
 *  the server's message, instead of being returned as "data" that a caller
 *  would try to JSON.parse into a cryptic crash or an empty result. */
export async function callToolText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  const text = content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
  if (result.isError) {
    throw new Error(`MCP tool "${name}" failed: ${text || 'no error detail provided'}`);
  }
  return text;
}

function inheritedEnv(extra?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      base[key] = value;
    }
  }
  return { ...base, ...(extra ?? {}) };
}
