import { callToolText, McpServerConfig, withMcpClient } from '../mcp/client.js';

export interface GithubSourceConfig {
  owner: string;
  repo: string;
  label?: string;
  /** How to launch the GitHub MCP server; defaults to the reference server via npx. */
  mcp?: McpServerConfig;
}

export interface RawIssue {
  number?: number;
  title?: string;
  body?: string | null;
  pull_request?: unknown;
}

export interface MappedStory {
  source: 'github';
  externalId: string;
  title: string;
  body: string;
}

/** Pure mapping from a GitHub issue to a testpilot story (unit-tested). */
export function issueToStory(issue: RawIssue): MappedStory {
  const title = (issue.title ?? '').trim() || `Issue ${issue.number ?? ''}`.trim();
  const body = (issue.body ?? '').trim() || title;
  return {
    source: 'github',
    externalId: issue.number !== undefined ? `#${issue.number}` : 'github',
    title,
    body
  };
}

/** Issues only (drop PRs), mapped to stories. */
export function issuesToStories(issues: RawIssue[]): MappedStory[] {
  return issues.filter((issue) => !issue.pull_request).map(issueToStory);
}

/** Default launch config for the reference GitHub MCP server. */
export function defaultGithubMcp(token: string): McpServerConfig {
  return {
    command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: token }
  };
}

/** Pull open issues from a repo via the GitHub MCP server and map them to stories. */
export async function fetchGithubStories(config: GithubSourceConfig, token: string): Promise<MappedStory[]> {
  const mcp = config.mcp ?? defaultGithubMcp(token);
  const issues = await withMcpClient(mcp, async (client) => {
    const text = await callToolText(client, 'list_issues', {
      owner: config.owner,
      repo: config.repo,
      state: 'open',
      ...(config.label ? { labels: [config.label] } : {})
    });
    const parsed = text ? JSON.parse(text) : [];
    return (Array.isArray(parsed) ? parsed : (parsed.issues ?? [])) as RawIssue[];
  });
  return issuesToStories(issues);
}
