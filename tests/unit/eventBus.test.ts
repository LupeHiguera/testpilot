import { describe, expect, it } from 'vitest';
import { emitStage, onPipelineEvent } from '../../src/events/bus.js';
import { PipelineEvent } from '../../src/events/types.js';

describe('pipeline event bus', () => {
  it('delivers emitted events to subscribers and stops after unsubscribe', () => {
    const received: PipelineEvent[] = [];
    const off = onPipelineEvent((event) => received.push(event));

    emitStage('run-1', 'spec', 'start', 'parsing', { foo: 'bar' });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      runId: 'run-1',
      stage: 'spec',
      status: 'start',
      label: 'parsing',
      data: { foo: 'bar' }
    });
    expect(typeof received[0].id).toBe('string');
    expect(typeof received[0].ts).toBe('number');

    off();
    emitStage('run-1', 'observe', 'pass', 'done');
    expect(received).toHaveLength(1); // no longer subscribed
  });
});
