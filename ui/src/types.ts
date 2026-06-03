export type Stage = 'spec' | 'observe' | 'generate' | 'run' | 'diagnose' | 'repair' | 'decision' | 'pr';
export type Status = 'start' | 'pass' | 'fail' | 'info';

export interface PipelineEvent {
  id: string;
  runId: string;
  stage: Stage;
  status: Status;
  label: string;
  ts: number;
  data?: Record<string, unknown>;
}

export interface RunSummary {
  runId: string;
  createdAt: number;
  summary?: {
    repairApplied: boolean;
    copyChange?: string;
    regression?: string;
  };
}

export interface Project {
  id: string;
  name: string;
  baseUrl: string;
  repoPath: string;
  testsDir: string;
  runnable: boolean;
}

export type StoryStatus = 'new' | 'generated' | 'passing' | 'failing' | 'needs-review';

export interface Story {
  id: string;
  projectId: string;
  source: string;
  title: string;
  status: StoryStatus;
  createdAt: number;
}
