import { useCallback, useEffect, useMemo, useState } from 'react';
import { getRun, listRuns, triggerRun } from './api';
import { useEventStream } from './useEventStream';
import { PixelCanyon } from './PixelCanyon';
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

const CONNECTION_NOTE: Record<string, string> = {
  open: 'Live — streaming events',
  connecting: 'Connecting to the event stream…',
  closed: 'Stream closed — reconnecting'
};

interface Diagnosis {
  category?: string;
  confidence?: number;
  reason?: string;
  repairable?: boolean;
}

export function App() {
  const { events, connection } = useEventStream();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError] = useState<string>();
  const [selected, setSelected] = useState<string | null>(null); // null = live view
  const [running, setRunning] = useState(false);

  const refreshRuns = useCallback(() => {
    listRuns()
      .then((list) => {
        setRuns(list);
        setRunsError(undefined);
      })
      .catch((error: Error) => setRunsError(error.message))
      .finally(() => setRunsLoading(false));
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
        <div className="brand">
          <h1 className="wordmark">test<b>pilot</b></h1>
          <div className="tagline">agentic QA · live canyon view</div>
        </div>
        <div className="spacer" />
        <span className="conn" role="status">
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
          <ul className="runlist">
            <li>
              <button className={selected === null ? 'active' : ''} onClick={() => setSelected(null)}>
                ● Live view
              </button>
            </li>
            {runsLoading && !runsError ? (
              <RunListSkeleton />
            ) : (
              <>
                {!runsError && runs.length === 0 && (
                  <li>
                    <p className="muted runlist-empty">No runs yet.</p>
                  </li>
                )}
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
              </>
            )}
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

function RunListSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <li key={i} aria-hidden>
          <div className="skeleton-row">
            <span className="skeleton skeleton-line w-70" />
            <span className="skeleton skeleton-line w-40" />
          </div>
        </li>
      ))}
      <li className="muted runlist-loading" role="status">
        Loading runs…
      </li>
    </>
  );
}

/** Pull the run-level verdict out of the live event stream, if available. */
function deriveVerdict(events: PipelineEvent[]) {
  const diagnoses = events
    .filter((e) => e.stage === 'diagnose' && e.data?.diagnosis)
    .map((e) => e.data!.diagnosis as Diagnosis);
  const regression = diagnoses.find((d) => d.category === 'PRODUCT_REGRESSION');
  const repairEvent = events.find((e) => e.stage === 'repair');
  const repairApplied = repairEvent ? repairEvent.status === 'pass' : false;
  const repairRefused = repairEvent?.status === 'info';
  const decision = events.find((e) => e.stage === 'decision' && e.status !== 'start');

  if (!decision && !repairEvent && diagnoses.length === 0) {
    return null;
  }
  return {
    category: regression?.category ?? diagnoses[0]?.category,
    repairApplied,
    repairRefused,
    failed: decision?.status === 'fail',
    done: Boolean(decision)
  };
}

function VerdictBanner({ events }: { events: PipelineEvent[] }) {
  const verdict = deriveVerdict(events);
  if (!verdict) {
    return null;
  }
  const { category, repairApplied, repairRefused, failed, done } = verdict;
  const tone = failed ? 'error' : repairApplied ? 'repaired' : 'guarded';
  const headline = failed
    ? 'Run failed'
    : repairApplied
      ? 'Repair applied'
      : repairRefused
        ? 'Repair refused'
        : done
          ? 'Run complete'
          : 'In progress';

  return (
    <div className={`verdict verdict-${tone}`} role="status">
      <span className="verdict-mark" aria-hidden>
        {failed ? '✕' : repairApplied ? '✓' : '⚠'}
      </span>
      <div className="verdict-body">
        <div className="verdict-headline">{headline}</div>
        <div className="verdict-detail">
          {category && (
            <span className={`tag tag-${category === 'PRODUCT_REGRESSION' ? 'regression' : 'copy'}`}>
              {category.replace(/_/g, ' ')}
            </span>
          )}
          <span className="verdict-note">
            {repairApplied
              ? 'Safe copy-change auto-repaired; regression refused.'
              : repairRefused
                ? 'Change refused — would weaken the test.'
                : done
                  ? 'See strata below for full evidence.'
                  : 'Awaiting the decision strata…'}
          </span>
        </div>
      </div>
    </div>
  );
}

function LiveCanyon({ events, connection }: { events: PipelineEvent[]; connection: string }) {
  if (events.length === 0) {
    return (
      <div className="panel hero">
        <PixelCanyon />
        <div className="hero-copy">
          <h2>Watch a run descend the canyon</h2>
          <p className="muted">
            Each pipeline stage forms a rock layer as it runs. Press <strong>Run demo</strong> to stream one live.
          </p>
          <p className={`stream-note stream-${connection}`}>
            <span className={`dot ${connection}`} aria-hidden /> {CONNECTION_NOTE[connection] ?? connection}
          </p>
        </div>
      </div>
    );
  }
  const degraded = connection !== 'open';
  return (
    <div className={`canyon-pane ${degraded ? 'degraded' : ''}`}>
      {degraded && (
        <div className={`liveness-strip liveness-${connection}`} role="status">
          <span className={`dot ${connection}`} aria-hidden /> {CONNECTION_NOTE[connection] ?? connection}
        </div>
      )}
      <VerdictBanner events={events} />
      <div className="canyon">
        {events.map((event, index) => (
          <Strata key={event.id} event={event} active={index === events.length - 1 && event.status === 'start'} />
        ))}
      </div>
    </div>
  );
}

function Strata({ event, active }: { event: PipelineEvent; active: boolean }) {
  const [open, setOpen] = useState(false);
  const evidence = collectEvidence(event);
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
      {open && evidence && <Evidence {...evidence} />}
    </>
  );
}

interface EvidenceData {
  diagnosis?: Diagnosis;
  shots: Array<{ key: string; value: string }>;
  diff?: string;
}

/** Human captions for the well-known screenshot artifact keys. */
const SHOT_CAPTION: Record<string, string> = {
  beforeScreenshot: 'Before — failing',
  failureScreenshot: 'Before — failing',
  afterScreenshot: 'After — repaired',
  screenshot: 'Observed page'
};

function collectEvidence(event: PipelineEvent): EvidenceData | null {
  const data = event.data ?? {};
  const shots = ['screenshot', 'failureScreenshot', 'beforeScreenshot', 'afterScreenshot']
    .map((key) => ({ key, value: data[key] }))
    .filter((s): s is { key: string; value: string } => typeof s.value === 'string');
  const diagnosis = data.diagnosis as Diagnosis | undefined;
  const diff = typeof data.diff === 'string' ? (data.diff as string) : undefined;

  if (shots.length === 0 && !diagnosis && !diff) {
    return null;
  }
  return { diagnosis, shots, diff };
}

function Evidence({ diagnosis, shots, diff }: EvidenceData) {
  return (
    <div className="evidence">
      {diagnosis && (
        <div className="evidence-block">
          <h3>Diagnosis</h3>
          <p className="diagnosis-line">
            <span className={`tag tag-${diagnosis.category === 'PRODUCT_REGRESSION' ? 'regression' : 'copy'}`}>
              {(diagnosis.category ?? 'UNKNOWN').replace(/_/g, ' ')}
            </span>
            {typeof diagnosis.confidence === 'number' && (
              <span className="muted">confidence {diagnosis.confidence}</span>
            )}
            <span className={`pill ${diagnosis.repairable ? 'pill-ok' : 'pill-no'}`}>
              {diagnosis.repairable ? 'repairable' : 'repair refused'}
            </span>
          </p>
          {diagnosis.reason && <p className="reason">{diagnosis.reason}</p>}
        </div>
      )}
      {shots.length > 0 && (
        <div className="evidence-block">
          <h3>Screenshots</h3>
          <div className="shot-grid">
            {shots.map(({ key, value }) => (
              <figure className="shot" key={key}>
                <img src={`/artifacts/${value}`} alt={SHOT_CAPTION[key] ?? key} loading="lazy" />
                <figcaption>{SHOT_CAPTION[key] ?? key}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
      {diff && (
        <div className="evidence-block">
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
