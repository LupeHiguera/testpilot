import { useEffect, useState } from 'react';
import type { PipelineEvent } from './types';

export type Connection = 'connecting' | 'open' | 'closed';

/** Subscribe to the live SSE pipeline stream. */
export function useEventStream() {
  const [events, setEvents] = useState<PipelineEvent[]>([]);
  const [connection, setConnection] = useState<Connection>('connecting');

  useEffect(() => {
    const source = new EventSource('/events');
    source.onopen = () => setConnection('open');
    source.onerror = () => setConnection('closed');
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as PipelineEvent;
        setEvents((previous) => [...previous, event]);
      } catch {
        // Ignore heartbeats / malformed frames.
      }
    };
    return () => source.close();
  }, []);

  return { events, connection };
}
