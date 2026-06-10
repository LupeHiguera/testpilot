// A real stdio MCP server used by tests/integration/connectors.test.ts to
// exercise the GitHub/Jira connectors end-to-end over an actual MCP connection:
// pagination, ADF descriptions, and tool-level errors (private repo).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

// 23 GitHub issues, two of which are pull requests (the connector must drop them).
const githubIssues = Array.from({ length: 23 }, (_, i) => ({
  number: i + 1,
  title: `Issue ${i + 1}`,
  body: `Body of issue ${i + 1}`,
  ...(i === 4 || i === 11 ? { pull_request: { url: `https://example.test/pr/${i + 1}` } } : {})
}));

// 5 Jira issues: a v2 string description, a v3 ADF description, and a
// fields-nested ADF variant among them.
const adf = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Open the cart' },
        { type: 'text', text: ' and pay' }
      ]
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Expect a receipt' }] }
  ]
};
const jiraIssues = [
  { key: 'TP-1', summary: 'Plain description', description: 'Just a string body' },
  { key: 'TP-2', summary: 'ADF description', description: adf },
  { key: 'TP-3', fields: { summary: 'Nested ADF', description: adf } },
  { key: 'TP-4', summary: 'No description' },
  { key: 'TP-5', summary: 'Last one', description: 'The fifth issue' }
];

const server = new McpServer({ name: 'connector-fixture', version: '0.0.0' });

server.tool(
  'list_issues',
  {
    owner: z.string(),
    repo: z.string(),
    state: z.string().optional(),
    labels: z.array(z.string()).optional(),
    page: z.number().optional(),
    per_page: z.number().optional()
  },
  async (args) => {
    if (args.repo === 'private-repo') {
      // The shape a real server produces for a 404/permission failure.
      return { isError: true, content: [{ type: 'text', text: 'Not Found: resource not accessible (HTTP 404)' }] };
    }
    const page = args.page ?? 1;
    const per = args.per_page ?? 30;
    const slice = githubIssues.slice((page - 1) * per, page * per);
    return { content: [{ type: 'text', text: JSON.stringify(slice) }] };
  }
);

server.tool(
  'jira_search',
  { jql: z.string(), startAt: z.number().optional(), maxResults: z.number().optional() },
  async (args) => {
    const startAt = args.startAt ?? 0;
    const max = args.maxResults ?? 2; // small pages so the search genuinely paginates
    const slice = jiraIssues.slice(startAt, startAt + max);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ issues: slice, startAt, maxResults: max, total: jiraIssues.length })
        }
      ]
    };
  }
);

await server.connect(new StdioServerTransport());
