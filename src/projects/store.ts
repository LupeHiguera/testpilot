import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultBaseUrl, defaultCredentials, projectRoot } from '../core/config.js';
import { Project } from './types.js';

const registryDir = path.join(projectRoot, '.testpilot', 'projects');

// The built-in demo project — always present, shares testpilot's Playwright context.
export const demoProject: Project = {
  id: 'demo',
  name: 'Bundled demo app',
  repoPath: projectRoot,
  baseUrl: defaultBaseUrl,
  testsDir: path.join('tests', 'generated'),
  docsDir: 'docs',
  route: '/login',
  credentials: defaultCredentials,
  framework: 'playwright',
  runnable: true,
  sources: [{ type: 'upload' }]
};

export async function listProjects(): Promise<Project[]> {
  const byId = new Map<string, Project>();
  byId.set(demoProject.id, demoProject);
  for (const project of await readAll()) {
    byId.set(project.id, project);
  }
  return [...byId.values()];
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await listProjects()).find((project) => project.id === id);
}

export async function saveProject(project: Project): Promise<string> {
  await fs.mkdir(registryDir, { recursive: true });
  const file = path.join(registryDir, `${project.id}.json`);
  await fs.writeFile(file, JSON.stringify(project, null, 2), 'utf8');
  return file;
}

async function readAll(): Promise<Project[]> {
  const entries = await fs.readdir(registryDir).catch(() => [] as string[]);
  const projects = await Promise.all(
    entries
      .filter((file) => file.endsWith('.json'))
      .map((file) =>
        fs
          .readFile(path.join(registryDir, file), 'utf8')
          .then((text) => JSON.parse(text) as Project)
          .catch(() => undefined)
      )
  );
  return projects.filter((project): project is Project => Boolean(project));
}
