import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export interface McpServerConfig {
  command: string;
  args?: string[];
  /** Extra env vars (e.g. a token) merged over the inherited environment. */
  env?: Record<string, string>;
}

/** Connect to a stdio MCP server, run `fn`, and always close the connection. */
export async function withMcpClient<T>(config: McpServerConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: inheritedEnv(config.env)
  });
  const client = new Client({ name: 'testpilot', version: '0.1.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

/** Call a tool and return the concatenated text content. */
export async function callToolText(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  const result = await client.callTool({ name, arguments: args });
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('\n');
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
