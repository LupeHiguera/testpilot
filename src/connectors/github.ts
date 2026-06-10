import { callToolText, McpServerConfig, withMcpClient } from '../mcp/client.js';

export interface GithubSourceConfig {
  owner: string;
  repo: string;
  label?: string;
  /** How to launch the GitHub MCP server; defaults to the reference server via npx. */
  mcp?: McpServerConfig;
  /** Tool name for listing issues; defaults to `list_issues`. */
  tool?: string;
  /** Extra static arguments merged into every tool call. */
  args?: Record<string, unknown>;
  /** Pagination argument names. The reference @modelcontextprotocol/server-github
   *  uses `page`/`per_page`; the official Go github-mcp-server uses `perPage` —
   *  configurable for that reason. */
  pageParam?: string;
  perPageParam?: string;
  /** Page size requested per call (default 50). */
  perPage?: number;
  /** Safety cap on total issues pulled across pages (default 200). */
  maxIssues?: number;
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

/** Parse a list_issues response: a bare array or an `{ issues: [...] }` wrapper.
 *  A non-JSON payload (e.g. an HTML error page) throws with the payload's head,
 *  so a private-repo 404 or bad token reads as what it is. */
export function parseIssuesPayload(text: string): RawIssue[] {
  if (!text.trim()) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`GitHub MCP returned an unparseable issues payload: ${text.slice(0, 200)}`);
  }
  if (Array.isArray(parsed)) {
    return parsed as RawIssue[];
  }
  const issues = (parsed as { issues?: unknown }).issues;
  return Array.isArray(issues) ? (issues as RawIssue[]) : [];
}

/**
 * Pull open issues from a repo via the GitHub MCP server and map them to stories.
 * Paginates until a short page, an empty page, or the `maxIssues` cap — a repo
 * with more issues than one page no longer silently loses the rest. Tool-level
 * errors (private repo without access, bad token) propagate as thrown errors.
 */
export async function fetchGithubStories(config: GithubSourceConfig, token: string): Promise<MappedStory[]> {
  const mcp = config.mcp ?? defaultGithubMcp(token);
  const perPage = config.perPage ?? 50;
  const maxIssues = config.maxIssues ?? 200;
  const pageParam = config.pageParam ?? 'page';
  const perPageParam = config.perPageParam ?? 'per_page';

  const issues = await withMcpClient(mcp, async (client) => {
    const all: RawIssue[] = [];
    for (let page = 1; all.length < maxIssues; page += 1) {
      const text = await callToolText(client, config.tool ?? 'list_issues', {
        owner: config.owner,
        repo: config.repo,
        state: 'open',
        ...(config.label ? { labels: [config.label] } : {}),
        ...config.args,
        [pageParam]: page,
        [perPageParam]: perPage
      });
      const batch = parseIssuesPayload(text);
      all.push(...batch);
      if (batch.length < perPage) {
        break; // a short (or empty) page is the last one
      }
    }
    return all.slice(0, maxIssues);
  });
  return issuesToStories(issues);
}
