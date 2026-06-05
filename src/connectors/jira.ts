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
}

export interface RawJiraIssue {
  key?: string;
  summary?: string;
  description?: string;
  fields?: { summary?: string; description?: string };
}

export interface MappedStory {
  source: 'jira';
  externalId: string;
  title: string;
  body: string;
}

/** Pure mapping from a Jira issue to a testpilot story (unit-tested). Tolerates
 *  both flattened ({ summary, description }) and REST ({ fields: {...} }) shapes. */
export function jiraIssueToStory(issue: RawJiraIssue): MappedStory {
  const summary = (issue.summary ?? issue.fields?.summary ?? '').trim();
  const description = (issue.description ?? issue.fields?.description ?? '').trim();
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

/** Pull Jira issues via a configured Jira MCP server (JQL) and map them to stories. */
export async function fetchJiraStories(config: JiraSourceConfig): Promise<MappedStory[]> {
  const issues = await withMcpClient(config.mcp, async (client) => {
    const args = { ...config.args, [config.jqlParam ?? 'jql']: config.jql };
    const text = await callToolText(client, config.tool ?? 'jira_search', args);
    const parsed = text ? JSON.parse(text) : [];
    return (Array.isArray(parsed) ? parsed : (parsed.issues ?? [])) as RawJiraIssue[];
  });
  return issuesToStories(issues);
}
