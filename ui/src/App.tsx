import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getDocs, getRun, listProjects, listRuns, listStories, triggerRun, uploadStory, writeDocs } from './api';
import { useEventStream } from './useEventStream';
import { PixelCanyon } from './PixelCanyon';
import { CanyonSpine } from './CanyonSpine';
import { PixelWordmark } from './PixelWordmark';
import { StageSprite, StatusMark } from './PixelSprites';
import type { DocsModel, PipelineEvent, Project, RunSummary, Stage, Status, Story, StoryStatus } from './types';

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

// Each pipeline stage maps to a named rock layer for the strata legend / depth cue.
const STAGE_DEPTH: Record<Stage, string> = {
  spec: 'Rim',
  observe: 'Caprock',
  generate: 'Sandstone',
  run: 'Shale',
  diagnose: 'Limestone',
  repair: 'Schist',
  pr: 'Ledge',
  decision: 'Bedrock'
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
  const [mode, setMode] = useState<'runs' | 'docs'>('runs');
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('demo');
  const [stories, setStories] = useState<Story[]>([]);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyBody, setStoryBody] = useState('');

  const refreshRuns = useCallback(() => {
    listRuns()
      .then((list) => {
        setRuns(list);
        setRunsError(undefined);
      })
      .catch((error: Error) => setRunsError(error.message))
      .finally(() => setRunsLoading(false));
  }, []);

  const refreshStories = useCallback(() => {
    listStories(projectId)
      .then(setStories)
      .catch(() => setStories([]));
  }, [projectId]);

  useEffect(refreshRuns, [refreshRuns]);
  useEffect(refreshStories, [refreshStories]);
  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  // The live run is whichever runId the most recent event belongs to.
  const liveRunId = events.length ? events[events.length - 1].runId : undefined;
  const liveEvents = useMemo(
    () => (liveRunId ? events.filter((event) => event.runId === liveRunId) : []),
    [events, liveRunId]
  );
  const runFinished = liveEvents.some((event) => event.stage === 'decision' && event.status !== 'start');

  // When a run finishes, refresh history + story statuses.
  useEffect(() => {
    if (runFinished) {
      setRunning(false);
      refreshRuns();
      refreshStories();
    }
  }, [runFinished, refreshRuns, refreshStories]);

  const onRun = async () => {
    setSelected(null);
    setRunning(true);
    await triggerRun('mock');
  };

  const onUploadStory = async (event: FormEvent) => {
    event.preventDefault();
    if (!storyBody.trim()) {
      return;
    }
    setSelected(null);
    setRunning(true);
    await uploadStory({ projectId, title: storyTitle.trim() || undefined, body: storyBody });
    setStoryTitle('');
    setStoryBody('');
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1 className="wordmark">
            <PixelWordmark scale={2.2} />
            <span className="sr-only">testpilot</span>
          </h1>
          <div className="tagline">AGENTIC&nbsp;QA · LIVE&nbsp;CANYON&nbsp;VIEW</div>
        </div>
        <div className="spacer" />
        <div className="viewtabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={mode === 'runs'} className={mode === 'runs' ? 'active' : ''} onClick={() => setMode('runs')}>
            Live
          </button>
          <button role="tab" aria-selected={mode === 'docs'} className={mode === 'docs' ? 'active' : ''} onClick={() => setMode('docs')}>
            Docs
          </button>
        </div>
        {projects.length > 0 && (
          <label className="proj">
            <span className="sr-only">Project</span>
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="conn" role="status">
          <span className={`dot ${connection}`} aria-hidden /> {connection}
        </span>
        <button onClick={onRun} disabled={running}>
          {running ? 'Running…' : '▶ Run demo'}
        </button>
      </header>

      <div className="layout">
        <aside className="rail">
          <section className="panel" aria-label="Stories">
            <h2>Stories</h2>
            <form className="story-form" onSubmit={onUploadStory}>
              <input
                className="story-input"
                value={storyTitle}
                onChange={(event) => setStoryTitle(event.target.value)}
                placeholder="Title (optional)"
                aria-label="Story title"
              />
              <textarea
                className="story-input story-body"
                value={storyBody}
                onChange={(event) => setStoryBody(event.target.value)}
                placeholder="Plain-English testing instructions…"
                rows={4}
                aria-label="Story instructions"
              />
              <button type="submit" disabled={running || !storyBody.trim()}>
                {running ? 'Running…' : '▾ Generate test'}
              </button>
            </form>
            {stories.length === 0 ? (
              <p className="muted">No stories yet for this project.</p>
            ) : (
              <ul className="storylist">
                {stories.map((story) => (
                  <li key={story.id}>
                    <span className="story-title">{story.title}</span>
                    <Chip text={story.status} kind={storyKind(story.status)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel" aria-label="Run history">
            <h2>Expeditions</h2>
          {runsError && <p className="muted">Couldn’t load runs: {runsError}</p>}
          <ul className="runlist">
            <li>
              <button className={selected === null ? 'active' : ''} onClick={() => setSelected(null)}>
                <span className="runlist-title">
                  <span className={`live-dot ${connection}`} aria-hidden /> Live view
                </span>
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
                      <span className="runlist-title">
                        {run.runId.replace(/^demo-/, '').replace(/T/, ' ').replace(/-\d+Z$/, '')}
                      </span>
                      <span className="when">{new Date(run.createdAt).toLocaleString()}</span>
                      {run.summary && (
                        <span className="chips">
                          {run.summary.copyChange && <Chip text={run.summary.copyChange} kind="pass" />}
                          {run.summary.regression && <Chip text={run.summary.regression} kind="fail" />}
                          <Chip text={run.summary.repairApplied ? 'repaired' : 'guarded'} kind={run.summary.repairApplied ? 'pass' : 'info'} />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
          </section>
        </aside>

        <main aria-label={mode === 'docs' ? 'Documentation' : 'Run detail'}>
          {mode === 'docs' ? (
            <DocsView projectId={projectId} />
          ) : selected === null ? (
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

interface VerdictView {
  tone: 'error' | 'repaired' | 'guarded';
  mark: Status;
  headline: string;
  category?: string;
  note: string;
}

/**
 * The verdict reads as a carved bedrock slab at the canyon floor — a chiseled
 * stone band with an etched status stamp, not a Bootstrap alert. The thin
 * stratigraphy strip on top ties it visually to the rock layers above it.
 */
function VerdictBanner({ view }: { view: VerdictView | null }) {
  if (!view) return null;
  const { tone, mark, headline, category, note } = view;
  return (
    <div className={`slab slab-${tone}`} role="status">
      <div className="slab-strata" aria-hidden />
      <div className="slab-stamp" aria-hidden>
        <StatusMark status={mark} size={34} />
      </div>
      <div className="slab-body">
        <div className="slab-kicker">Bedrock · verdict</div>
        <div className="slab-headline">{headline}</div>
        <div className="slab-detail">
          {category && (
            <span className={`tag tag-${category === 'PRODUCT_REGRESSION' ? 'regression' : 'copy'}`}>
              {category.replace(/_/g, ' ')}
            </span>
          )}
          <span className="slab-note">{note}</span>
        </div>
      </div>
    </div>
  );
}

function verdictFromLive(events: PipelineEvent[]): VerdictView | null {
  const v = deriveVerdict(events);
  if (!v) return null;
  const { category, repairApplied, repairRefused, failed, done } = v;
  const tone = failed ? 'error' : repairApplied ? 'repaired' : 'guarded';
  return {
    tone,
    mark: failed ? 'fail' : repairApplied ? 'pass' : 'info',
    headline: failed
      ? 'Run failed'
      : repairApplied
        ? 'Repair applied'
        : repairRefused
          ? 'Repair refused'
          : done
            ? 'Run complete'
            : 'In progress',
    category,
    note: repairApplied
      ? 'Safe copy-change auto-repaired; regression refused.'
      : repairRefused
        ? 'Change refused — would weaken the test.'
        : done
          ? 'See strata below for full evidence.'
          : 'Awaiting the decision strata…'
  };
}

/** Format a millisecond span as a compact elapsed clock (e.g. 0:04, 1:12). */
function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function LiveCanyon({ events, connection }: { events: PipelineEvent[]; connection: string }) {
  if (events.length === 0) {
    return (
      <div className="panel hero">
        <PixelCanyon />
        <div className="hero-copy">
          <h2>Watch a run descend the canyon</h2>
          <p className="muted">
            Each pipeline stage carves a rock layer as it runs. Press <strong>Run demo</strong> to stream one live.
          </p>
          <p className={`stream-note stream-${connection}`}>
            <span className={`dot ${connection}`} aria-hidden /> {CONNECTION_NOTE[connection] ?? connection}
          </p>
        </div>
      </div>
    );
  }
  const degraded = connection !== 'open';
  const activeIndex = events[events.length - 1].status === 'start' ? events.length - 1 : -1;
  // The run "descends" to the deepest layer reached so far; the spine marker
  // and the depth gauge both read off this.
  const reached = events.length;
  const startTs = events[0].ts;
  const lastTs = events[events.length - 1].ts;
  const elapsed = fmtElapsed(lastTs - startTs);
  const running = activeIndex !== -1;

  return (
    <div className={`canyon-pane ${degraded ? 'degraded' : ''}`}>
      {degraded && (
        <div className={`liveness-strip liveness-${connection}`} role="status">
          <span className={`dot ${connection}`} aria-hidden /> {CONNECTION_NOTE[connection] ?? connection}
        </div>
      )}
      <div className="canyon-grid">
        <div className="canyon-spine-col" aria-hidden>
          <CanyonSpine total={reached} reached={reached} rows={Math.max(24, reached * 3)} />
        </div>
        <div className="canyon-main">
          <div className="canyon">
            {events.map((event, index) => (
              <Strata key={event.id} event={event} active={index === activeIndex} />
            ))}
          </div>
          <VerdictBanner view={verdictFromLive(events)} />
          <div className="river-floor" aria-hidden />
        </div>
        <aside className="depth-gauge" aria-label="Run depth and elapsed time">
          <div className="gauge-block">
            <span className="gauge-num">{reached}</span>
            <span className="gauge-lab">layers carved</span>
          </div>
          <div className="gauge-block">
            <span className="gauge-num">{elapsed}</span>
            <span className="gauge-lab">elapsed</span>
          </div>
          <div className={`gauge-status ${running ? 'is-live' : ''}`}>
            <span className={`dot ${running ? 'open' : 'closed'}`} aria-hidden />
            {running ? 'descending' : 'at rest'}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * One concrete datum to surface on a non-start row FACE, pulled straight from
 * the event payload so each layer carries real evidence (evidence_altitude):
 *  - diagnose rows -> confidence % + repairable verdict
 *  - run rows      -> scenario + pass/fail
 *  - repair rows   -> applied / refused
 * spec/observe/generate/pr rows already carry their datum in the label (route,
 * captured counts, bundle path), so they don't get a second chip. Start rows and
 * anything without a meaningful datum return null.
 */
function rowDatum(event: PipelineEvent): { text: string; kind: 'ok' | 'no' | 'neutral' } | null {
  if (event.status === 'start') return null;
  const data = event.data ?? {};
  const scenario = typeof data.scenario === 'string' ? data.scenario : undefined;
  const diagnosis = data.diagnosis as Diagnosis | undefined;

  if (event.stage === 'diagnose' && diagnosis) {
    const conf =
      typeof diagnosis.confidence === 'number'
        ? `${Math.round(diagnosis.confidence <= 1 ? diagnosis.confidence * 100 : diagnosis.confidence)}% conf`
        : undefined;
    const repair = diagnosis.repairable ? 'repairable' : 'repair refused';
    return {
      text: [conf, repair].filter(Boolean).join(' · '),
      kind: diagnosis.repairable ? 'ok' : 'no'
    };
  }
  if (event.stage === 'run') {
    const verdict = event.status === 'pass' ? 'pass' : event.status === 'fail' ? 'fail' : event.status;
    return {
      text: [scenario, verdict].filter(Boolean).join(' · '),
      kind: event.status === 'pass' ? 'ok' : event.status === 'fail' ? 'no' : 'neutral'
    };
  }
  if (event.stage === 'repair') {
    const applied = event.status === 'pass';
    return { text: applied ? 'applied' : 'refused', kind: applied ? 'ok' : 'no' };
  }
  return null;
}

function Strata({ event, active }: { event: PipelineEvent; active: boolean }) {
  const [open, setOpen] = useState(false);
  const evidence = collectEvidence(event);
  const hasEvidence = Boolean(evidence);
  const datum = rowDatum(event);
  // Surface the failure category on the row FACE (not just when expanded), and
  // flag a regression so the row gets a stronger geological "fault line" break.
  const category = evidence?.diagnosis?.category;
  const isRegression = category === 'PRODUCT_REGRESSION';
  const faceClass = [
    'strata',
    `s-${event.stage}`,
    `status-${event.status}`,
    active ? 'active' : '',
    hasEvidence ? 'clickable' : '',
    isRegression ? 'is-regression' : ''
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className="strata-wall" aria-hidden>
        <span className="strata-depth">{STAGE_DEPTH[event.stage]}</span>
      </span>
      <span className="strata-sprite" aria-hidden>
        <StageSprite stage={event.stage} size={28} />
      </span>
      <span className="strata-text">
        <span className="stage">{STAGE_NAME[event.stage]}</span>
        <span className="label">{event.label}</span>
        {datum && <span className={`row-datum datum-${datum.kind}`}>{datum.text}</span>}
      </span>
      {category && (
        <span className={`tag tag-${isRegression ? 'regression' : 'copy'} strata-tag`}>
          {category.replace(/_/g, ' ')}
        </span>
      )}
      <span className={`badge ${event.status}`}>
        <StatusMark status={event.status} size={13} />
        {event.status}
      </span>
      {hasEvidence && (
        <span className={`disclose ${open ? 'open' : ''}`} aria-hidden>
          ▸
        </span>
      )}
    </>
  );

  return (
    <>
      {hasEvidence ? (
        <button
          type="button"
          className={`${faceClass} strata-btn`}
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {content}
        </button>
      ) : (
        <div className={faceClass}>{content}</div>
      )}
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

function DiagnosisCard({ diagnosis }: { diagnosis: Diagnosis }) {
  return (
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
  );
}

function Evidence({ diagnosis, shots, diff }: EvidenceData) {
  return (
    <div className="evidence">
      {diagnosis && <DiagnosisCard diagnosis={diagnosis} />}
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

interface Scenario {
  name: string;
  passed: boolean;
  diagnosis?: string;
  repairApplied?: boolean;
  note: string;
}

interface PastReport {
  intent?: { name?: string; originalSpec?: string };
  diagnosis?: Diagnosis;
  repair?: { safeToApply?: boolean; reason?: string };
  repairApplied?: boolean;
  scenarios?: Scenario[];
}

/** Build a run-level verdict for history view from the static report.json. */
function verdictFromReport(report: PastReport): VerdictView | null {
  const scenarios = report.scenarios ?? [];
  const regression = scenarios.find((s) => s.diagnosis === 'PRODUCT_REGRESSION');
  const repaired = scenarios.find((s) => s.repairApplied);
  const anyFail = scenarios.some((s) => !s.passed);
  const category =
    report.diagnosis?.category && report.diagnosis.category !== 'UNKNOWN'
      ? report.diagnosis.category
      : regression?.diagnosis ?? repaired?.diagnosis;

  if (scenarios.length === 0 && !report.diagnosis) return null;

  // A run that both repaired a copy-change AND refused a regression is the
  // headline "guarded" success; a run with an unhandled failure is an error.
  if (anyFail && !repaired) {
    return {
      tone: 'error',
      mark: 'fail',
      headline: 'Regression caught',
      category,
      note: 'A real product regression was detected; the test was not weakened.'
    };
  }
  if (repaired) {
    return {
      tone: 'repaired',
      mark: 'pass',
      headline: 'Repaired & guarded',
      category,
      note: regression
        ? 'Copy-change auto-repaired; the genuine regression was refused.'
        : 'Safe copy-change auto-repaired.'
    };
  }
  return {
    tone: 'guarded',
    mark: 'info',
    headline: 'Run complete',
    category,
    note: report.repair?.reason ?? 'No repair was required.'
  };
}

function PastRun({ runId }: { runId: string }) {
  const [report, setReport] = useState<PastReport | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    setReport(null);
    setError(undefined);
    getRun(runId)
      .then((data) => setReport((data.report as PastReport) ?? {}))
      .catch((e: Error) => setError(e.message));
  }, [runId]);

  if (error) {
    return (
      <div className="panel hero">
        <p className="muted">Couldn’t load this run: {error}</p>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="panel hero">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  const scenarios = report.scenarios ?? [];
  const title = runId.replace(/^demo-/, '').replace(/T/, ' ').replace(/-\d+Z$/, '');

  const depth = scenarios.length;
  return (
    <div className="canyon-pane">
      <div className="past-head">
        <h2 className="past-title">{title}</h2>
        {report.intent?.name && <span className="past-spec">{report.intent.name}</span>}
      </div>
      <div className="canyon-grid">
        <div className="canyon-spine-col" aria-hidden>
          <CanyonSpine total={depth} reached={depth} rows={Math.max(24, depth * 3)} />
        </div>
        <div className="canyon-main">
          <div className="canyon">
            {scenarios.length === 0 && <p className="muted strata-empty">No scenario detail recorded for this run.</p>}
            {scenarios.map((scenario) => (
              <ScenarioStrata key={scenario.name} scenario={scenario} />
            ))}
          </div>
          <VerdictBanner view={verdictFromReport(report)} />
          {report.diagnosis && report.diagnosis.category !== 'UNKNOWN' && (
            <div className="evidence">
              <DiagnosisCard diagnosis={report.diagnosis} />
            </div>
          )}
          <div className="river-floor" aria-hidden />
        </div>
        <aside className="depth-gauge" aria-label="Run depth">
          <div className="gauge-block">
            <span className="gauge-num">{depth}</span>
            <span className="gauge-lab">scenarios</span>
          </div>
          <div className="gauge-status">
            <span className="dot closed" aria-hidden />
            archived
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A history scenario row, styled like a live strata layer so the views match. */
function ScenarioStrata({ scenario }: { scenario: Scenario }) {
  // Map the scenario to a representative stage so it gets a sprite + rock layer.
  const stage: Stage = scenario.diagnosis === 'PRODUCT_REGRESSION' ? 'run' : scenario.repairApplied ? 'repair' : 'decision';
  const status: Status = scenario.passed ? 'pass' : 'fail';
  return (
    <div className={`strata s-${stage} status-${status}`}>
      <span className="strata-wall" aria-hidden>
        <span className="strata-depth">{STAGE_DEPTH[stage]}</span>
      </span>
      <span className="strata-sprite" aria-hidden>
        <StageSprite stage={stage} size={28} />
      </span>
      <span className="strata-text">
        <span className="stage">
          {scenario.diagnosis ? scenario.diagnosis.replace(/_/g, ' ') : 'scenario'}
          {scenario.repairApplied !== undefined && (
            <span className={`mini-pill ${scenario.repairApplied ? 'mini-ok' : 'mini-no'}`}>
              {scenario.repairApplied ? 'repaired' : 'refused'}
            </span>
          )}
        </span>
        <span className="label">{scenario.name}</span>
        <span className="scenario-note">{scenario.note}</span>
      </span>
      <span className={`badge ${status}`}>
        <StatusMark status={status} size={13} />
        {scenario.passed ? 'pass' : 'fail'}
      </span>
    </div>
  );
}

function Chip({ text, kind }: { text: string; kind: 'pass' | 'fail' | 'info' }) {
  return <span className={`badge ${kind}`}>{text}</span>;
}

function storyKind(status: StoryStatus): 'pass' | 'fail' | 'info' {
  if (status === 'passing') return 'pass';
  if (status === 'failing' || status === 'needs-review') return 'fail';
  return 'info';
}

function DocsView({ projectId }: { projectId: string }) {
  const [docs, setDocs] = useState<DocsModel | null>(null);
  const [error, setError] = useState<string>();
  const [written, setWritten] = useState<string>();

  const load = useCallback(() => {
    setDocs(null);
    setError(undefined);
    setWritten(undefined);
    getDocs(projectId)
      .then(setDocs)
      .catch((e: Error) => setError(e.message));
  }, [projectId]);

  useEffect(load, [load]);

  const onWrite = async () => {
    const result = await writeDocs(projectId);
    setWritten(`Wrote ${result.flowCount} flow(s) → ${result.indexPath}`);
  };

  if (error) {
    return (
      <div className="panel hero">
        <p className="muted">Couldn’t load docs: {error}</p>
      </div>
    );
  }
  if (!docs) {
    return (
      <div className="panel hero">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  return (
    <div className="panel docs">
      <div className="docs-head">
        <h2>{docs.project.name} — Living Docs</h2>
        <button className="secondary" onClick={onWrite}>
          ▾ Write to repo
        </button>
      </div>
      {written && <p className="muted docs-written">{written}</p>}
      {docs.flows.length === 0 ? (
        <p className="muted">No stories yet — upload one to document a flow.</p>
      ) : (
        <div className="doclist">
          {docs.flows.map((flow) => (
            <article className="doc-card" key={flow.storyId}>
              <header className="doc-card-head">
                <h3>{flow.title}</h3>
                <Chip text={flow.status} kind={storyKind(flow.status)} />
              </header>
              <p className="doc-instr">{flow.instructions}</p>
              <ol className="doc-steps">
                {flow.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
              <p className="doc-test">
                backed by <code>{flow.testRef}</code> · source {flow.source}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
