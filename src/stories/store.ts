import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from '../core/config.js';
import { Story } from './types.js';

/** A project id must be a single path segment (slug). Anything else — separators,
 *  `..` — would let a caller walk the join below out of the registry root. */
export function isValidProjectId(projectId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(projectId);
}

function storyDir(projectId: string): string {
  if (!isValidProjectId(projectId)) {
    throw new Error(`Invalid project id: ${projectId}`);
  }
  return path.join(projectRoot, '.testpilot', 'projects', projectId, 'stories');
}

export async function addStory(input: {
  projectId: string;
  source: Story['source'];
  title: string;
  body: string;
  externalId?: string;
}): Promise<Story> {
  const story: Story = {
    id: randomUUID().slice(0, 8),
    createdAt: Date.now(),
    status: 'new',
    ...input
  };
  const dir = storyDir(story.projectId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${story.id}.json`), JSON.stringify(story, null, 2), 'utf8');
  return story;
}

/**
 * Add a story pulled from an external tracker, or update the one already pulled
 * for the same issue — re-running `spec pull` must not duplicate every story.
 * Identity is (source, externalId). An unchanged issue is left untouched; a
 * changed title/body is written through AND the status reset to 'new', because
 * a test generated for the old text no longer reflects the story.
 */
export async function upsertExternalStory(input: {
  projectId: string;
  source: Story['source'];
  externalId: string;
  title: string;
  body: string;
}): Promise<{ story: Story; action: 'created' | 'updated' | 'unchanged' }> {
  const existing = (await listStories(input.projectId)).find(
    (story) => story.source === input.source && story.externalId === input.externalId
  );
  if (!existing) {
    return { story: await addStory(input), action: 'created' };
  }
  if (existing.title === input.title && existing.body === input.body) {
    return { story: existing, action: 'unchanged' };
  }
  const updated: Story = { ...existing, title: input.title, body: input.body, status: 'new' };
  await fs.writeFile(path.join(storyDir(input.projectId), `${existing.id}.json`), JSON.stringify(updated, null, 2), 'utf8');
  return { story: updated, action: 'updated' };
}

export async function listStories(projectId: string): Promise<Story[]> {
  const dir = storyDir(projectId);
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const stories = await Promise.all(
    entries
      .filter((file) => file.endsWith('.json'))
      .map((file) =>
        fs
          .readFile(path.join(dir, file), 'utf8')
          .then((text) => JSON.parse(text) as Story)
          .catch(() => undefined)
      )
  );
  return stories.filter((story): story is Story => Boolean(story)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateStory(projectId: string, id: string, patch: Partial<Story>): Promise<void> {
  const file = path.join(storyDir(projectId), `${id}.json`);
  const current = JSON.parse(await fs.readFile(file, 'utf8')) as Story;
  await fs.writeFile(file, JSON.stringify({ ...current, ...patch }, null, 2), 'utf8');
}
