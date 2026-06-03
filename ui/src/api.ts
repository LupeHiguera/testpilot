import type { RunSummary } from './types';

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
