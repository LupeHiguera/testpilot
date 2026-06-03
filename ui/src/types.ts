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
