import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PipelineEvent, PipelineEventStatus, PipelineStage } from './types.js';

// A process-local bus the pipeline emits stage events to. It is a no-op in normal
// CLI use (no subscribers) and gains an SSE sink when the live server is running.
const emitter = new EventEmitter();
emitter.setMaxListeners(0); // allow many concurrent SSE subscribers

export function emitStage(
  runId: string,
  stage: PipelineStage,
  status: PipelineEventStatus,
  label: string,
  data?: Record<string, unknown>
): void {
  const event: PipelineEvent = { id: randomUUID(), runId, stage, status, label, ts: Date.now(), data };
  emitter.emit('event', event);
}

export function onPipelineEvent(listener: (event: PipelineEvent) => void): () => void {
  emitter.on('event', listener);
  return () => {
    emitter.off('event', listener);
  };
}
