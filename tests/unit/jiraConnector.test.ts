import { describe, expect, it } from 'vitest';
import { issuesToStories, jiraIssueToStory } from '../../src/connectors/jira.js';

describe('jira connector mapping', () => {
  it('maps a flattened jira issue', () => {
    const story = jiraIssueToStory({ key: 'QA-12', summary: 'Login flow', description: 'Go to /login...' });
    expect(story).toEqual({ source: 'jira', externalId: 'QA-12', title: 'Login flow', body: 'Go to /login...' });
  });

  it('reads the REST fields shape', () => {
    const story = jiraIssueToStory({ key: 'QA-3', fields: { summary: 'Checkout', description: 'Buy a thing' } });
    expect(story.title).toBe('Checkout');
    expect(story.body).toBe('Buy a thing');
  });

  it('falls back to summary then key when description is empty', () => {
    expect(jiraIssueToStory({ key: 'QA-9', summary: 'Search' }).body).toBe('Search');
    expect(jiraIssueToStory({ key: 'QA-9' }).title).toBe('QA-9');
  });

  it('maps a list of issues', () => {
    const stories = issuesToStories([
      { key: 'A-1', summary: 'x' },
      { key: 'A-2', summary: 'y' }
    ]);
    expect(stories.map((s) => s.externalId)).toEqual(['A-1', 'A-2']);
  });
});
