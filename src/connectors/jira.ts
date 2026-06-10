import { callToolText, McpServerConfig, withMcpClient } from '../mcp/client.js';

export interface JiraSourceConfig {
  jql: string;
  /** How to reach the Jira/Atlassian MCP server: a local stdio launch
   *  ({ command, args, env }) or a remote endpoint ({ transport: 'http' | 'sse', url, headers }). */
  mcp: McpServerConfig;
  /** Tool name to call for a JQL search; defaults to the common `jira_search`. */
  tool?: string;
  /** The argument key the tool expects the JQL under; defaults to `jql` (some
   *  servers use e.g. `query` or `jqlQuery`). */
  jqlParam?: string;
  /** Extra static arguments merged into the tool call (e.g. { maxResults: 50,
   *  fields: ['summary', 'description'] }). The resolved JQL always wins over these. */
  args?: Record<string, unknown>;
  /** Pagination offset argument name (Jira REST search convention); default `startAt`. */
  startAtParam?: string;
  /** Safety cap on total issues pulled across pages (default 200). */
  maxIssues?: number;
}

/** An Atlassian Document Format node — Jira Cloud (REST v3) returns issue
 *  descriptions as these rich-doc trees rather than plain strings. */
export interface AdfNode {
  type?: string;
  text?: string;
  content?: AdfNode[];
}

export interface RawJiraIssue {
  key?: string;
  summary?: string;
  description?: string | AdfNode;
  fields?: { summary?: string; description?: string | AdfNode };
}

/** Flatten an ADF tree to plain text: concatenate text nodes, separating
 *  block-level nodes (paragraphs, list items, headings) with newlines. */
export function adfToText(node: AdfNode | string | undefined): string {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node.text === 'string') {
    return node.text;
  }
  const children = (node.content ?? []).map(adfToText).filter(Boolean);
  // Inline containers concatenate their text runs; everything else (doc, lists,
  // list items, quotes) separates its blocks with newlines.
  const inlineContainer = node.type === 'paragraph' || node.type === 'heading';
  return children.join(inlineContainer ? '' : '\n').trim();
}

export interface MappedStory {
  source: 'jira';
  externalId: string;
  title: string;
  body: string;
}

/** Pure mapping from a Jira issue to a testpilot story (unit-tested). Tolerates
 *  flattened ({ summary, description }) and REST ({ fields: {...} }) shapes, and
 *  descriptions that are plain strings (v2) or ADF documents (v3). */
export function jiraIssueToStory(issue: RawJiraIssue): MappedStory {
  const summary = (issue.summary ?? issue.fields?.summary ?? '').trim();
  const description = adfToText(issue.description ?? issue.fields?.description).trim();
  const title = summary || issue.key || 'Jira issue';
  const body = description || title;
  return {
    source: 'jira',
    externalId: issue.key ?? 'jira',
    title,
    body
  };
}

export function issuesToStories(issues: RawJiraIssue[]): MappedStory[] {
  return issues.map(jiraIssueToStory);
}

/** One page of a Jira search response: either a bare issue array (no further
 *  pages discoverable) or the REST search envelope with pagination fields. */
function parseSearchPayload(text: string): { issues: RawJiraIssue[]; total?: number } {
  if (!text.trim()) {
    return { issues: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Jira MCP returned an unparseable search payload: ${text.slice(0, 200)}`);
  }
  if (Array.isArray(parsed)) {
    return { issues: parsed as RawJiraIssue[] };
  }
  const envelope = parsed as { issues?: unknown; total?: unknown };
  return {
    issues: Array.isArray(envelope.issues) ? (envelope.issues as RawJiraIssue[]) : [],
    total: typeof envelope.total === 'number' ? envelope.total : undefined
  };
}

/**
 * Pull Jira issues via a configured Jira MCP server (JQL) and map them to stories.
 * When the server returns the REST search envelope (`{ issues, total, startAt }`),
 * pages through `startAt` until every issue (or the `maxIssues` cap) is collected;
 * a bare-array response is taken as complete. Tool-level errors (bad token,
 * unknown project) propagate as thrown errors.
 */
export async function fetchJiraStories(config: JiraSourceConfig): Promise<MappedStory[]> {
  const maxIssues = config.maxIssues ?? 200;
  const startAtParam = config.startAtParam ?? 'startAt';
  const issues = await withMcpClient(config.mcp, async (client) => {
    const all: RawJiraIssue[] = [];
    for (;;) {
      const args = {
        ...config.args,
        [config.jqlParam ?? 'jql']: config.jql,
        ...(all.length > 0 ? { [startAtParam]: all.length } : {})
      };
      const text = await callToolText(client, config.tool ?? 'jira_search', args);
      const page = parseSearchPayload(text);
      all.push(...page.issues);
      const known = page.total !== undefined ? Math.min(page.total, maxIssues) : undefined;
      const done =
        page.issues.length === 0 || // empty page → nothing further
        page.total === undefined || // no envelope → single-shot response
        all.length >= (known ?? 0) ||
        all.length >= maxIssues;
      if (done) {
        break;
      }
    }
    return all.slice(0, maxIssues);
  });
  return issuesToStories(issues);
}
