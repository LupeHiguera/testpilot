import { describe, expect, it } from 'vitest';
import { issuesToStories, issueToStory } from '../../src/connectors/github.js';

describe('github connector mapping', () => {
  it('maps an issue to a story', () => {
    const story = issueToStory({ number: 42, title: 'Login flow', body: 'Go to /login, sign in...' });
    expect(story).toEqual({
      source: 'github',
      externalId: '#42',
      title: 'Login flow',
      body: 'Go to /login, sign in...'
    });
  });

  it('falls back to the title when the body is empty', () => {
    expect(issueToStory({ number: 7, title: 'Checkout', body: null }).body).toBe('Checkout');
  });

  it('drops pull requests, keeps issues', () => {
    const stories = issuesToStories([
      { number: 1, title: 'real issue' },
      { number: 2, title: 'a PR', pull_request: { url: 'x' } }
    ]);
    expect(stories).toHaveLength(1);
    expect(stories[0].externalId).toBe('#1');
  });
});
