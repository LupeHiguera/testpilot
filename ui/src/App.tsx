import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRun, listRuns, triggerRun } from './api';
import { useEventStream } from './useEventStream';
import type { PipelineEvent, RunSummary, Stage, Status } from './types';

const STATUS_GLYPH: Record<Status, string> = { start: '▶', pass: '✓', fail: '✕', info: '•' };
const STAGE_NAME: Record<Stage, string> = {
  spec: 'Spec',
  observe: 'Observe',
  generate: 'Generate',
  run: 'Run',
  diagnose: 'Diagnose',
  repair: 'Repair',
  pr: 'PR',
  decision: 'Decision'
};

export function App() {
  const { events, connection } = useEventStream();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsError, setRunsError] = useState<string>();
  const [selected, setSelected] = useState<string | null>(null); // null = live view
  const [running, setRunning] = useState(false);

  const refreshRuns = useCallback(() => {
    listRuns()
      .then((list) => {
        setRuns(list);
        setRunsError(undefined);
      })
      .catch((error: Error) => setRunsError(error.message));
  }, []);

  useEffect(refreshRuns, [refreshRuns]);

  // The live run is whichever runId the most recent event belongs to.
  const liveRunId = events.length ? events[events.length - 1].runId : undefined;
  const liveEvents = useMemo(
    () => (liveRunId ? events.filter((event) => event.runId === liveRunId) : []),
    [events, liveRunId]
  );
  const runFinished = liveEvents.some((event) => event.stage === 'decision' && event.status !== 'start');

  // When a run finishes, refresh history.
  useEffect(() => {
    if (runFinished) {
      setRunning(false);
      refreshRuns();
    }
  }, [runFinished, refreshRuns]);

  const onRun = async () => {
    setSelected(null);
    setRunning(true);
    await triggerRun('mock');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="wordmark">test<b>pilot</b></div>
          <div className="tagline">agentic QA · live canyon view</div>
        </div>
        <div className="spacer" />
        <span className="conn">
          <span className={`dot ${connection}`} aria-hidden /> {connection}
        </span>
        <button onClick={onRun} disabled={running}>
          {running ? 'Running…' : '▶ Run demo'}
        </button>
      </header>

      <div className="layout">
        <aside className="panel" aria-label="Run history">
          <h2>Runs</h2>
          {runsError && <p className="muted">Couldn’t load runs: {runsError}</p>}
          {!runsError && runs.length === 0 && <p className="muted">No runs yet.</p>}
          <ul className="runlist">
            <li>
              <button className={selected === null ? 'active' : ''} onClick={() => setSelected(null)}>
                ● Live view
              </button>
            </li>
            {runs.map((run) => (
              <li key={run.runId}>
                <button className={selected === run.runId ? 'active' : ''} onClick={() => setSelected(run.runId)}>
                  {run.runId.replace(/^demo-/, '').replace(/T/, ' ').replace(/-\d+Z$/, '')}
                  <span className="when">{new Date(run.createdAt).toLocaleString()}</span>
                  {run.summary && (
                    <span className="chips">
                      <Chip text={run.summary.copyChange ?? '—'} kind="pass" />
                      <Chip text={run.summary.regression ?? '—'} kind="fail" />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main aria-label="Run detail">
          {selected === null ? (
            <LiveCanyon events={liveEvents} connection={connection} />
          ) : (
            <PastRun runId={selected} />
          )}
        </main>
      </div>
    </div>
  );
}

function LiveCanyon({ events, connection }: { events: PipelineEvent[]; connection: string }) {
  if (events.length === 0) {
    return (
      <div className="panel hero">
        <h2>Watch a run descend the canyon</h2>
        <p className="muted">
          Each pipeline stage forms a rock layer as it runs. Press <strong>Run demo</strong> to stream one live.
        </p>
        <p className="muted">Stream: {connection}</p>
      </div>
    );
  }
  return (
    <div className="canyon">
      {events.map((event, index) => (
        <Strata key={event.id} event={event} active={index === events.length - 1 && event.status === 'start'} />
      ))}
    </div>
  );
}

function Strata({ event, active }: { event: PipelineEvent; active: boolean }) {
  const [open, setOpen] = useState(false);
  const evidence = extractEvidence(event);
  const hasEvidence = Boolean(evidence);
  return (
    <>
      <div
        className={`strata s-${event.stage} ${active ? 'active' : ''} ${hasEvidence ? 'clickable' : ''}`}
        onClick={hasEvidence ? () => setOpen((value) => !value) : undefined}
        role={hasEvidence ? 'button' : undefined}
        tabIndex={hasEvidence ? 0 : undefined}
        onKeyDown={hasEvidence ? (e) => (e.key === 'Enter' || e.key === ' ') && setOpen((v) => !v) : undefined}
        aria-expanded={hasEvidence ? open : undefined}
      >
        <span className="glyph" aria-hidden>
          {STATUS_GLYPH[event.status]}
        </span>
        <span>
          <span className="stage">{STAGE_NAME[event.stage]}</span>
          <div className="label">{event.label}</div>
        </span>
        <span className={`badge ${event.status}`}>{event.status}</span>
      </div>
      {open && evidence}
    </>
  );
}

function extractEvidence(event: PipelineEvent): JSX.Element | null {
  const data = event.data ?? {};
  const shots = ['screenshot', 'failureScreenshot', 'beforeScreenshot', 'afterScreenshot']
    .map((key) => [key, data[key]] as const)
    .filter(([, value]) => typeof value === 'string') as [string, string][];
  const diagnosis = data.diagnosis as { category?: string; confidence?: number; reason?: string; repairable?: boolean } | undefined;
  const diff = typeof data.diff === 'string' ? (data.diff as string) : undefined;

  if (shots.length === 0 && !diagnosis && !diff) {
    return null;
  }
  return (
    <div className="evidence">
      {diagnosis && (
        <div>
          <h3>Diagnosis</h3>
          <p>
            <strong>{diagnosis.category}</strong> · confidence {diagnosis.confidence} ·{' '}
            {diagnosis.repairable ? 'repairable' : 'repair refused'}
          </p>
          {diagnosis.reason && <p className="reason">{diagnosis.reason}</p>}
        </div>
      )}
      {shots.length > 0 && (
        <div>
          <h3>Screenshots</h3>
          {shots.map(([key, value]) => (
            <figure key={key} style={{ margin: 0 }}>
              <img src={`/artifacts/${value}`} alt={key} loading="lazy" />
            </figure>
          ))}
        </div>
      )}
      {diff && (
        <div>
          <h3>Proposed change</h3>
          <pre>{renderDiff(diff)}</pre>
        </div>
      )}
    </div>
  );
}

function renderDiff(diff: string) {
  return diff.split('\n').map((line, index) => {
    const className = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : undefined;
    return (
      <span key={index} className={className}>
        {line}
        {'\n'}
      </span>
    );
  });
}

function PastRun({ runId }: { runId: string }) {
  const [report, setReport] = useState<{ scenarios?: { name: string; passed: boolean; diagnosis?: string; note: string }[] } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setReport(null);
    setError(undefined);
    getRun(runId)
      .then((data) => setReport((data.report as typeof report) ?? {}))
      .catch((e: Error) => setError(e.message));
  }, [runId]);

  if (error) {
    return <div className="panel hero"><p className="muted">Couldn’t load this run: {error}</p></div>;
  }
  if (!report) {
    return <div className="panel hero"><p className="muted">Loading…</p></div>;
  }
  return (
    <div className="panel">
      <h2>{runId}</h2>
      <div className="canyon">
        {(report.scenarios ?? []).map((scenario) => (
          <div key={scenario.name} className={`strata s-${scenario.passed ? 'pr' : 'run'}`}>
            <span className="glyph" aria-hidden>{scenario.passed ? '✓' : '✕'}</span>
            <span>
              <span className="stage">{scenario.diagnosis ?? 'scenario'}</span>
              <div className="label">{scenario.name}</div>
            </span>
            <span className={`badge ${scenario.passed ? 'pass' : 'fail'}`}>{scenario.passed ? 'pass' : 'fail'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ text, kind }: { text: string; kind: 'pass' | 'fail' }) {
  return <span className={`badge ${kind}`}>{text}</span>;
}
