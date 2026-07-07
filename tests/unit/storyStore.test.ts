import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { projectRoot } from '../../src/core/config.js';
import { listStories, updateStory, upsertExternalStory } from '../../src/stories/store.js';

// A throwaway project id inside the real (gitignored) registry; removed afterwards.
const projectId = 'zz-upsert-test';

afterAll(async () => {
  await fs.rm(path.join(projectRoot, '.testpilot', 'projects', projectId), { recursive: true, force: true });
});

describe('upsertExternalStory', () => {
  it('re-pulling the same issue does not duplicate the story', async () => {
    const first = await upsertExternalStory({ projectId, source: 'github', externalId: '#1', title: 'Login flow', body: 'Go to /login…' });
    const again = await upsertExternalStory({ projectId, source: 'github', externalId: '#1', title: 'Login flow', body: 'Go to /login…' });

    expect(first.action).toBe('created');
    expect(again.action).toBe('unchanged');
    expect(again.story.id).toBe(first.story.id);
    expect((await listStories(projectId)).filter((s) => s.externalId === '#1')).toHaveLength(1);
  });

  it('an edited issue updates the story in place and resets its status', async () => {
    const created = await upsertExternalStory({ projectId, source: 'github', externalId: '#2', title: 'Checkout', body: 'old text' });
    // Simulate the pipeline having run this story to green.
    await updateStory(projectId, created.story.id, { status: 'passing' });

    const updated = await upsertExternalStory({ projectId, source: 'github', externalId: '#2', title: 'Checkout', body: 'new text' });

    expect(updated.action).toBe('updated');
    expect(updated.story.id).toBe(created.story.id);
    expect(updated.story.body).toBe('new text');
    // The old test no longer reflects the story text — status must fall back to new.
    expect(updated.story.status).toBe('new');
  });

  it('the same externalId from different sources stays two stories', async () => {
    const github = await upsertExternalStory({ projectId, source: 'github', externalId: 'X-1', title: 'From github', body: 'a' });
    const jira = await upsertExternalStory({ projectId, source: 'jira', externalId: 'X-1', title: 'From jira', body: 'b' });

    expect(github.action).toBe('created');
    expect(jira.action).toBe('created');
    expect(jira.story.id).not.toBe(github.story.id);
  });
});
