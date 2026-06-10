import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fetchGithubStories } from '../../src/connectors/github.js';
import { fetchJiraStories } from '../../src/connectors/jira.js';
import { McpServerConfig } from '../../src/mcp/client.js';
import { projectRoot } from '../../src/core/config.js';

// End-to-end connector checks over a REAL stdio MCP connection: the fixture
// server (tests/fixtures/connectorMcpServer.mjs) is spawned as a child process
// and serves paginated GitHub issues, paginated Jira search envelopes with ADF
// descriptions, and a tool-level error for a private repo.
const mcp: McpServerConfig = {
  command: process.execPath,
  args: [path.join(projectRoot, 'tests', 'fixtures', 'connectorMcpServer.mjs')]
};

describe('GitHub connector over MCP', () => {
  it('paginates through all issue pages and drops pull requests', { timeout: 30_000 }, async () => {
    // 23 issues at 10/page → three calls (10, 10, 3); 2 of them are PRs.
    const stories = await fetchGithubStories({ owner: 'o', repo: 'big-repo', mcp, perPage: 10 }, 'token');
    expect(stories).toHaveLength(21);
    expect(stories[0].externalId).toBe('#1');
    expect(stories.at(-1)?.externalId).toBe('#23');
    expect(stories.map((s) => s.externalId)).not.toContain('#5'); // the PR
  });

  it('respects the maxIssues cap', { timeout: 30_000 }, async () => {
    const stories = await fetchGithubStories({ owner: 'o', repo: 'big-repo', mcp, perPage: 10, maxIssues: 10 }, 'token');
    expect(stories.length).toBeLessThanOrEqual(10);
  });

  it('surfaces a private-repo failure as a thrown error, not empty data', { timeout: 30_000 }, async () => {
    await expect(fetchGithubStories({ owner: 'o', repo: 'private-repo', mcp }, 'token')).rejects.toThrow(/Not Found/);
  });
});

describe('Jira connector over MCP', () => {
  it('pages the search envelope via startAt and extracts ADF descriptions', { timeout: 30_000 }, async () => {
    // total 5, fixture serves 2 per page → three calls via startAt.
    const stories = await fetchJiraStories({ jql: 'project = TP', mcp });
    expect(stories).toHaveLength(5);
    expect(stories.map((s) => s.externalId)).toEqual(['TP-1', 'TP-2', 'TP-3', 'TP-4', 'TP-5']);
    // v3 ADF doc flattened to plain text, paragraphs newline-separated.
    expect(stories[1].body).toBe('Open the cart and pay\nExpect a receipt');
    // fields-nested ADF variant.
    expect(stories[2].body).toBe('Open the cart and pay\nExpect a receipt');
    // a missing description falls back to the title.
    expect(stories[3].body).toBe('No description');
  });

  it('respects the maxIssues cap', { timeout: 30_000 }, async () => {
    const stories = await fetchJiraStories({ jql: 'project = TP', mcp, maxIssues: 3 });
    expect(stories).toHaveLength(3);
  });
});
