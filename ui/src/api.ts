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

/** Outcome of asking the server to start work. `error` carries the server's
 *  refusal (e.g. "a run is already in progress" from the 409 run lock) so the
 *  UI can surface it instead of silently doing nothing. */
export interface TriggerResult {
  started: boolean;
  error?: string;
}

async function toTriggerResult(request: Promise<Response>): Promise<TriggerResult> {
  let response: Response;
  try {
    response = await request;
  } catch {
    return { started: false, error: 'the live server is unreachable' };
  }
  if (response.ok) {
    return { started: true };
  }
  const body = (await response.json().catch(() => undefined)) as { error?: string } | undefined;
  return { started: false, error: body?.error ?? `request failed (${response.status})` };
}

export async function triggerRun(mode: 'mock' | 'openai' = 'mock'): Promise<TriggerResult> {
  return toTriggerResult(
    fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    })
  );
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

export async function uploadStory(input: { projectId: string; title?: string; body: string }): Promise<TriggerResult> {
  return toTriggerResult(
    fetch('/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    })
  );
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
