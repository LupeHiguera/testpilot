import type { DocsModel, Project, RunSummary, Story } from './types';

export async function listRuns(): Promise<RunSummary[]> {
  const response = await fetch('/api/runs');
  if (!response.ok) {
    throw new Error(`Failed to load runs (${response.status})`);
  }
  return response.json();
}

export async function getRun(runId: string): Promise<{ runId: string; report?: unknown; summary?: unknown }> {
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load run ${runId} (${response.status})`);
  }
  return response.json();
}

export async function triggerRun(mode: 'mock' | 'openai' = 'mock'): Promise<void> {
  await fetch('/api/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode })
  });
}

export async function listProjects(): Promise<Project[]> {
  const response = await fetch('/api/projects');
  if (!response.ok) {
    throw new Error(`Failed to load projects (${response.status})`);
  }
  return response.json();
}

export async function listStories(projectId: string): Promise<Story[]> {
  const response = await fetch(`/api/stories?projectId=${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load stories (${response.status})`);
  }
  return response.json();
}

export async function uploadStory(input: { projectId: string; title?: string; body: string }): Promise<void> {
  await fetch('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input)
  });
}

export async function getDocs(projectId: string): Promise<DocsModel> {
  const response = await fetch(`/api/docs?projectId=${encodeURIComponent(projectId)}`);
  if (!response.ok) {
    throw new Error(`Failed to load docs (${response.status})`);
  }
  return response.json();
}

export async function writeDocs(projectId: string): Promise<{ indexPath: string; flowCount: number }> {
  const response = await fetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId })
  });
  return response.json();
}
