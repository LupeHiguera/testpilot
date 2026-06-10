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
