export type PipelineStage =
  | 'spec'
  | 'observe'
  | 'generate'
  | 'run'
  | 'diagnose'
  | 'repair'
  | 'decision'
  | 'pr';

export type PipelineEventStatus = 'start' | 'pass' | 'fail' | 'info';

export interface PipelineEvent {
  id: string;
  runId: string;
  stage: PipelineStage;
  status: PipelineEventStatus;
  label: string;
  ts: number;
  data?: Record<string, unknown>;
}
