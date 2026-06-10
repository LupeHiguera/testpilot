import { describe, expect, it } from 'vitest';
import { issuesToStories, issueToStory, parseIssuesPayload } from '../../src/connectors/github.js';

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

describe('parseIssuesPayload', () => {
  it('accepts a bare array and an { issues } wrapper', () => {
    expect(parseIssuesPayload('[{"number":1}]')).toEqual([{ number: 1 }]);
    expect(parseIssuesPayload('{"issues":[{"number":2}]}')).toEqual([{ number: 2 }]);
    expect(parseIssuesPayload('')).toEqual([]);
    expect(parseIssuesPayload('{"unrelated":true}')).toEqual([]);
  });

  it('throws with the payload head on non-JSON (e.g. an HTML error page)', () => {
    expect(() => parseIssuesPayload('<html>404 Not Found</html>')).toThrow(/unparseable.*404 Not Found/s);
  });
});
