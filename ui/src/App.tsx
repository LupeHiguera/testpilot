import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocs, getRun, listProjects, listRuns, listStories, triggerRun, uploadStory, writeDocs } from './api';
import { useEventStream } from './useEventStream';
import { CanyonSpine } from './CanyonSpine';
import { PixelWordmark } from './PixelWordmark';
import { CanyonAtmosphere, type SkyPhase } from './CanyonAtmosphere';
import { ChromeGlyph, StageSprite, StatusMark } from './PixelSprites';
import type { DocsModel, PipelineEvent, Project, RunSummary, Stage, Status, Story, StoryStatus } from './types';
import { collectJudgments, deriveVerdict, fmtElapsed, rowDatum } from './runModel';
import type { Diagnosis, JudgmentCall, VerdictView } from './runModel';

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

// Each pipeline stage is a named ledge the run descends to — the rock layer at
// that depth. Read top (rim) to bottom (bedrock) as the expedition descends.
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

// Full pipeline depth — used to scale the descent fraction (and thus the
// time-of-day sky shift) against the whole canyon, not just rows streamed so far.
const TOTAL_STAGES = 8;

const CONNECTION_NOTE: Record<string, string> = {
  open: 'Live — streaming events',
  connecting: 'Connecting to the event stream…',
  closed: 'Stream closed — reconnecting'
};

// Short carved-chip labels for the rim-console connection readout, so a degraded
// stream reads as an intentional state ("Reconnecting" / "Stream closed") rather
// than the terse raw status word.
const CONN_LABEL: Record<string, string> = {
  open: 'Live',
  connecting: 'Reconnecting',
  closed: 'Stream closed'
};


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
  // One-shot "dispatched" flash: set true the instant a story is sent, cleared
  // after the confirm animation window so the slate flashes sunlit once on
  // submit (a quick commit acknowledgement). Reduced-motion gated in CSS.
  const [justSent, setJustSent] = useState(false);

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
    setJustSent(true);
    window.setTimeout(() => setJustSent(false), 700);
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
        <div className="rim-console">
          <div className="viewtabs" role="tablist" aria-label="View">
            <button role="tab" aria-selected={mode === 'runs'} className={`tab-live ${mode === 'runs' ? 'active' : ''}`} onClick={() => setMode('runs')}>
              <span className={`tab-live-led ${connection}`} aria-hidden />
              Live
            </button>
            <button role="tab" aria-selected={mode === 'docs'} className={mode === 'docs' ? 'active' : ''} onClick={() => setMode('docs')}>
              Docs
            </button>
          </div>
          {projects.length > 0 && (
            <label className="proj">
              <span className="proj-label">Project</span>
              <span className="proj-slot">
                <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                <span className="proj-chev" aria-hidden>▾</span>
              </span>
            </label>
          )}
          <span className={`conn ${connection}`} role="status">
            <span className={`dot ${connection}`} aria-hidden /> {CONN_LABEL[connection] ?? connection}
          </span>
          <button className="run-demo-btn" onClick={onRun} disabled={running}>
            {running ? 'Running…' : '▶ Run demo'}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="rail">
          <section className="panel tablet" aria-label="Field log">
            <h2 className="tablet-head">
              <span className="tablet-glyph" aria-hidden>
                <ChromeGlyph name="quill" size={20} />
              </span>
              <span className="tablet-title">Field Log</span>
            </h2>
            <form className={`story-form slate ${justSent ? 'just-sent' : ''}`} onSubmit={onUploadStory}>
              <label className="slate-field">
                <span className="slate-label">Expedition title</span>
                <input
                  className="story-input"
                  value={storyTitle}
                  onChange={(event) => setStoryTitle(event.target.value)}
                  placeholder="Title (optional)"
                  aria-label="Story title"
                />
              </label>
              <label className="slate-field">
                <span className="slate-label">Field notes</span>
                <textarea
                  className="story-input story-body"
                  value={storyBody}
                  onChange={(event) => setStoryBody(event.target.value)}
                  placeholder="Plain-English testing instructions…"
                  rows={4}
                  aria-label="Story instructions"
                />
              </label>
              <button type="submit" className="dispatch-btn" disabled={running || !storyBody.trim()}>
                {running ? 'Running…' : '▾ Generate test'}
              </button>
            </form>
            {stories.length === 0 ? (
              <div className="carved-empty tablet-empty" role="note">
                <span className="carved-empty-head">No stories logged yet</span>
                <span className="carved-empty-sub">Log field notes above to chart this project’s first expedition.</span>
              </div>
            ) : (
              <ul className="storylist">
                {stories.map((story) => (
                  <li key={story.id} className="trail-entry">
                    <span className="trail-glyph" aria-hidden>
                      <ChromeGlyph name="trail" size={18} />
                    </span>
                    <span className="story-title">{story.title}</span>
                    <span className={`trail-stamp trail-stamp-${storyKind(story.status)}`}>
                      <StatusMark status={storyKind(story.status)} size={11} />
                      {story.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel tablet" aria-label="Expeditions">
            <h2 className="tablet-head">
              <span className="tablet-glyph" aria-hidden>
                <ChromeGlyph name="flag" size={20} />
              </span>
              <span className="tablet-title">Expeditions</span>
            </h2>
          {runsError && (
            <div className="carved-empty is-error" role="alert">
              <span className="carved-empty-head">Stream lost · couldn’t load runs</span>
              <span className="carved-empty-sub">{runsError}</span>
            </div>
          )}
          <ul className="runlist">
            <li>
              <button className={`ledger-row live-row ${selected === null ? 'active' : ''}`} onClick={() => setSelected(null)}>
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
                    <div className="carved-empty runlist-empty" role="note">
                      <span className="carved-empty-head">No expeditions logged yet</span>
                      <span className="carved-empty-sub">Press “Run demo” to send the first descent down the canyon.</span>
                    </div>
                  </li>
                )}
                {runs.map((run, index) => {
                  const isActive = selected === run.runId;
                  const tone = summaryTone(run.summary);
                  // The full prose "why" is revealed only when an entry is in focus
                  // — the SELECTED row, or (when nothing is selected) the single
                  // most-recent past run at the top of the log. Every other resting
                  // row keeps just the compact verdict cue (spine + stamp + tone
                  // word), so the column reads as a calm, scannable stamped ledger
                  // instead of a wall of near-identical sentences.
                  const showWhy = isActive || (selected === null && index === 0);
                  return (
                    <li key={run.runId}>
                      <button
                        className={`ledger-row ${tone ? `stamped stamped-${tone}` : ''} ${isActive ? 'active' : ''}`}
                        onClick={() => setSelected(run.runId)}
                      >
                        <span className="runlist-title">
                          {run.runId.replace(/^demo-/, '').replace(/T/, ' ').replace(/-\d+Z$/, '')}
                        </span>
                        <span className="when">{new Date(run.createdAt).toLocaleString()}</span>
                        {/* Every past run carries a COMPACT verdict cue at rest:
                            the color-keyed binding spine + stamp mark + tone WORD
                            (REFUSED / REPAIR APPLIED / GUARDED) — the verdict at a
                            glance. The full prose one-line "why" is gated behind
                            focus (selected row, or the most-recent run) so the log
                            stays calm and scannable, not a column of duplicate
                            sentences. */}
                        {tone && <HistorySeal tone={tone} why={showWhy ? summaryWhy(run.summary, tone) : null} />}
                      </button>
                    </li>
                  );
                })}
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

/** The big stamped seal phrase, keyed to the verdict tone — the unmissable line
 *  pressed into the bedrock. Reads as an expedition stamp, not a footer note. */
const SEAL_PHRASE: Record<VerdictView['tone'], string> = {
  error: 'Product regression — refused',
  repaired: 'Safe drift — repair applied',
  guarded: 'Run guarded — no repair needed'
};

/** Short stamp word keyed to the verdict tone — the rust/teal/gold seal label. */
const SEAL_WORD: Record<VerdictView['tone'], string> = {
  error: 'refused',
  repaired: 'repair applied',
  guarded: 'guarded'
};

/** The pixel mark each verdict tone stamps with (rust fail / teal pass / gold info). */
const SEAL_MARK: Record<VerdictView['tone'], Status> = {
  error: 'fail',
  repaired: 'pass',
  guarded: 'info'
};

/** Derive the color-keyed verdict tone from a run-summary (history list rows). */
function summaryTone(summary: RunSummary['summary']): VerdictView['tone'] | null {
  if (!summary) return null;
  if (summary.regression) return 'error';
  if (summary.repairApplied) return 'repaired';
  return 'guarded';
}

/** Turn a raw category token (UI_COPY_CHANGE / PRODUCT_REGRESSION) into a short
 *  human phrase for the one-line "why". Falls back to the lower-cased token. */
function categoryPhrase(category?: string): string | undefined {
  if (!category) return undefined;
  if (category === 'UI_COPY_CHANGE') return 'copy reworded';
  if (category === 'PRODUCT_REGRESSION') return 'broke the flow';
  return category.replace(/_/g, ' ').toLowerCase();
}

/**
 * A single supporting "why" line for a SELECTED history row, composed only from
 * the real run-summary fields the list already has (the diagnosis categories +
 * the repair-applied flag) — so a past decision carries its evidence, not just
 * its colour. Nothing is fabricated: every clause maps to a present field.
 */
function summaryWhy(summary: RunSummary['summary'], tone: VerdictView['tone']): string | null {
  if (!summary) return null;
  const drift = categoryPhrase(summary.copyChange);
  if (tone === 'error') {
    return `regression: ${categoryPhrase(summary.regression) ?? 'broke the flow'} — repair refused to keep the test honest`;
  }
  if (tone === 'repaired') {
    return `safe drift: ${drift ?? 'selector reworded'} — repair applied, no regression`;
  }
  return 'clean run — no drift detected, no repair needed';
}

/**
 * A compact stamped seal for the Expeditions history rows. When a past run is
 * selected, this presses the same color-keyed seal (rust = refused / teal =
 * repair applied / gold = guarded) into the ledger row, mirroring the bedrock
 * verdict slab so a past judgment is unmissable. Reuses the .slab-* tone keys.
 */
function HistorySeal({ tone, why }: { tone: VerdictView['tone']; why?: string | null }) {
  return (
    <span className={`history-seal slab-${tone}`}>
      <span className="history-seal-head">
        <span className="history-seal-stamp" aria-hidden>
          <StatusMark status={SEAL_MARK[tone]} size={14} />
        </span>
        <span className="history-seal-word">{SEAL_WORD[tone]}</span>
      </span>
      {why && <span className="history-seal-why">{why}</span>}
    </span>
  );
}

/**
 * The verdict reads as a carved bedrock slab at the canyon floor — a chiseled
 * stone band with a LARGE stamped seal (color-keyed: teal = safe drift repaired,
 * rust = regression refused, gold = guarded), not a Bootstrap alert. The thin
 * stratigraphy strip on top ties it visually to the rock layers above it.
 */
function VerdictBanner({ view }: { view: VerdictView | null }) {
  if (!view) return null;
  const { tone, mark, headline, category, note } = view;
  return (
    <div className={`slab slab-${tone}`} role="status">
      <div className="slab-strata" aria-hidden />
      <div className="slab-stamp" aria-hidden>
        <StatusMark status={mark} size={40} />
      </div>
      <div className="slab-body">
        <div className="slab-kicker">Bedrock · verdict stamped</div>
        <div className="slab-seal">{SEAL_PHRASE[tone]}</div>
        <div className="slab-detail">
          {category && (
            <span className={`tag tag-${category === 'PRODUCT_REGRESSION' ? 'regression' : 'copy'}`}>
              {category.replace(/_/g, ' ')}
            </span>
          )}
          <span className="slab-headline-inline">{headline}</span>
          <span className="slab-note">{note}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The judgment ledger: the dramatic heart of the verdict moment. It sits flush
 * under the bedrock slab and surfaces BOTH calls side by side with their real
 * evidence — safe drift that was auto-repaired (with the before/after proof and
 * the proposed diff) vs. the product regression that was refused (with the
 * reasoning for refusing). This is what makes the verdict unmissable AND
 * explains the safe-drift-vs-regression judgment with evidence.
 */
function JudgmentLedger({ calls }: { calls: JudgmentCall[] }) {
  if (calls.length === 0) return null;
  return (
    <div className="ledger" role="group" aria-label="Judgment & evidence">
      <div className="ledger-rail" aria-hidden />
      {calls.map((call) => (
        <JudgmentCard key={`${call.title}-${call.kind}`} call={call} />
      ))}
    </div>
  );
}

/** One shared on-theme non-happy state (loading / empty / error): a carved
 *  engraved stone slip, tone-keyed — so every state belongs to the canyon world
 *  rather than falling back to a bare muted sentence. */
function CarvedState({ head, sub, tone }: { head: string; sub?: string; tone?: 'error' }) {
  return (
    <div className={`carved-empty${tone === 'error' ? ' is-error' : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="carved-empty-head">{head}</span>
      {sub && <span className="carved-empty-sub">{sub}</span>}
    </div>
  );
}

/** A before/after evidence plate that HEALS a missing or failed capture into an
 *  on-theme "capture unavailable" slip instead of the raw <img>'s black fallback
 *  (which read as a dark void, especially stacked full-width at 375). */
function PlateImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="plate-missing" role="img" aria-label={`${alt} — capture unavailable`}>
        <span className="plate-missing-mark" aria-hidden>▦</span>
        <span className="plate-missing-text">capture unavailable</span>
      </span>
    );
  }
  // Eager (not lazy): these two verdict plates are the signature evidence and sit far
  // down a tall mobile page — lazy-loading left them as a dark void at 375. onError still
  // heals a genuinely-missing artifact into the on-theme placeholder above.
  return <img src={`/artifacts/${src}`} alt={alt} onError={() => setFailed(true)} />;
}

function JudgmentCard({ call }: { call: JudgmentCall }) {
  // The proposed change is the proof — show it EXPANDED by default so the
  // verdict moment is self-explaining with no interaction required. A collapse
  // control remains for readers who want to fold it away.
  const [showDiff, setShowDiff] = useState(true);
  const isRegression = call.category === 'PRODUCT_REGRESSION';
  const hasShots = Boolean(call.before || call.after);
  return (
    <section className={`judgment judgment-${call.kind}`}>
      <header className="judgment-head">
        <span className={`judgment-tag tag tag-${isRegression ? 'regression' : 'copy'}`}>
          {(call.category ?? call.title).replace(/_/g, ' ')}
        </span>
        <span className="judgment-arrow" aria-hidden>
          ▸
        </span>
        <span className={`judgment-verdict jv-${call.kind}`}>
          <StatusMark status={call.kind === 'repaired' ? 'pass' : 'fail'} size={13} />
          {call.verdict}
        </span>
      </header>
      {call.reason && <p className="judgment-reason">{call.reason}</p>}
      {call.detail && <p className="judgment-detail">{call.detail}</p>}
      {hasShots && (
        <div className="judgment-shots" role="group" aria-label="Before and after evidence plates">
          {call.before && (
            <figure className="judgment-shot is-before">
              <figcaption className="plate-cap">
                <span className="plate-tag">Before</span>
                <span className="plate-state">failing run</span>
              </figcaption>
              <span className="plate-mat">
                <PlateImage src={call.before} alt="Before — the failing run" />
              </span>
            </figure>
          )}
          {call.after && (
            <figure className="judgment-shot is-after">
              <figcaption className="plate-cap">
                <span className="plate-tag">After</span>
                <span className="plate-state">repaired run</span>
              </figcaption>
              <span className="plate-mat">
                <PlateImage src={call.after} alt="After — the repaired run" />
              </span>
            </figure>
          )}
        </div>
      )}
      {call.diff && (
        <div className="judgment-diff-wrap">
          <div className="judgment-diff-bar">
            <span className="judgment-diff-label">Proposed change · diff</span>
            <button
              type="button"
              className="judgment-diff-toggle"
              onClick={() => setShowDiff((v) => !v)}
              aria-expanded={showDiff}
            >
              {showDiff ? '▾ Collapse' : '▸ Expand'}
            </button>
          </div>
          {showDiff && <pre className="judgment-diff">{renderDiff(call.diff)}</pre>}
        </div>
      )}
    </section>
  );
}

function verdictFromLive(events: PipelineEvent[]): VerdictView | null {
  const v = deriveVerdict(events);
  if (!v) return null;
  const { category, repairApplied, repairRefused, failed, done } = v;
  const tone = failed ? 'error' : repairApplied ? 'repaired' : 'guarded';
  return {
    tone,
    done,
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

/**
 * Map a resolved VerdictView to the atmospheric sky phase + whether the run is
 * fully done. The signature "sun sets on the verdict" moment keys off this:
 *  - error    -> smoky red sunset (a regression was caught)
 *  - repaired -> teal-green dusk  (auto-repaired & guarded)
 *  - guarded  -> golden sunset    (clean / no repair needed)
 * `done` is true once the run carries no in-flight (start) row, i.e. the
 * verdict is final rather than provisional.
 */
function verdictFor(view: VerdictView): { phase: SkyPhase; done: boolean } {
  const phase: SkyPhase = view.tone === 'error' ? 'error' : view.tone === 'repaired' ? 'repaired' : 'pass';
  return { phase, done: view.done };
}


/**
 * Live elapsed clock. While the run is in flight, re-render every second so the
 * gauge ticks in real time from the first event's wall-clock timestamp; once it
 * stops, lock to the final span. Ticks regardless of reduced-motion (a clock is
 * information, not decoration).
 */
function useLiveElapsed(startTs: number, lastTs: number, running: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const span = running ? now - startTs : lastTs - startTs;
  return fmtElapsed(span);
}

/**
 * Clamp a 0..1 progress value so it only updates when it moves by more than ~2%
 * (or hits the 0/1 extremes), avoiding micro-jitter / churn on fast streams.
 */
function useClampedProgress(raw: number): number {
  const [value, setValue] = useState(raw);
  useEffect(() => {
    setValue((prev) => {
      const settled = raw === 0 || raw === 1;
      return settled || Math.abs(raw - prev) > 0.02 ? raw : prev;
    });
  }, [raw]);
  return value;
}

/**
 * A number that briefly pulses when its value increases — used so "LEDGES
 * DESCENDED" gives a small tick of life each time the run drops to a new ledge.
 * The pulse is a one-shot CSS animation re-triggered by toggling a data attribute.
 */
function PulseNum({ value, className }: { value: number; className?: string }) {
  const prev = useRef(value);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (value > prev.current) {
      setPulse(true);
      const id = window.setTimeout(() => setPulse(false), 600);
      prev.current = value;
      return () => window.clearTimeout(id);
    }
    prev.current = value;
  }, [value]);
  return (
    <span className={`${className ?? ''} ${pulse ? 'num-pulse' : ''}`.trim()}>{value}</span>
  );
}

function LiveCanyon({ events, connection }: { events: PipelineEvent[]; connection: string }) {
  // First-visit / no-events-yet: show the LIVING-SKY hero (with the static baked
  // mesas + sun) so the very first impression is the alive canyon, not a flat
  // pixel banner. The descent atmosphere is the through-line of the whole view.
  if (events.length === 0) {
    return <CanyonHero connection={connection} />;
  }
  return <LiveCanyonRun events={events} connection={connection} />;
}

/**
 * The empty / first-visit hero. Renders the living atmosphere (idle phase, with
 * the baked static mesa silhouette + sun) as a full backdrop behind the
 * call-to-action, so a screenshot of a fresh dashboard already shows a canyon.
 */
function CanyonHero({ connection }: { connection: string }) {
  return (
    <div className="canyon-pane">
      <div className="canyon-shell hero-shell">
        <CanyonAtmosphere progress={0} phase="idle" />
        <CanyonHorizon running={false} done={false} phase="idle" />
        <div className="hero-copy hero-copy-sky">
          <h2>Watch a run descend the canyon</h2>
          <p className="muted">
            Each pipeline stage descends one ledge deeper into the canyon. Press <strong>Run demo</strong> to stream a descent live.
          </p>
          <p className={`stream-note stream-${connection}`}>
            <span className={`dot ${connection}`} aria-hidden /> {CONNECTION_NOTE[connection] ?? connection}
          </p>
        </div>
      </div>
    </div>
  );
}

function LiveCanyonRun({ events, connection }: { events: PipelineEvent[]; connection: string }) {
  const degraded = connection !== 'open';
  const activeIndex = events[events.length - 1].status === 'start' ? events.length - 1 : -1;
  // The run "descends" to the deepest layer reached so far; the spine marker
  // and the depth gauge both read off this.
  const reached = events.length;
  const startTs = events[0].ts;
  const lastTs = events[events.length - 1].ts;

  // Descent fraction drives the living sky (day -> dusk -> sunset) and the glow
  // travelling down the spine. We measure against the full 8-stage pipeline so
  // the time-of-day shift is meaningful even mid-run.
  const verdict = verdictFromLive(events);
  const done = verdict ? verdictFor(verdict).done : false;
  const running = activeIndex !== -1 && !done;

  // Live elapsed clock: while a run is in flight the clock TICKS in real time
  // (1s interval, measured from the first event's wall-clock ts) instead of
  // freezing at the last event's timestamp. Once the run finishes it locks to
  // the final span. Keeps ticking under reduced-motion — it's a clock, not decor.
  const elapsed = useLiveElapsed(startTs, lastTs, running);

  // Clamp the descent fraction so it only moves on meaningful change (>~2%),
  // avoiding micro-jitter / churn on fast event streams.
  const rawProgress = done ? 1 : Math.min(1, reached / TOTAL_STAGES);
  const progress = useClampedProgress(rawProgress);
  const phase: SkyPhase = verdict ? verdictFor(verdict).phase : 'running';

  return (
    <div className={`canyon-pane ${degraded ? 'degraded' : ''}`}>
      {degraded && (
        <div className={`liveness-strip liveness-${connection}`} role="status">
          <span className={`dot ${connection}`} aria-hidden /> {CONNECTION_NOTE[connection] ?? connection}
        </div>
      )}
      <div className={`canyon-shell ${done ? 'run-complete' : ''}`}>
        <CanyonAtmosphere progress={progress} phase={phase} />
        <CanyonHorizon running={running} done={done} phase={phase} />
        <div className="canyon-grid">
        <div className="canyon-spine-col" aria-hidden>
          <CanyonSpine total={reached} reached={reached} rows={Math.max(24, reached * 3)} active={running} />
        </div>
        <div className="canyon-main">
          <div className="canyon">
            {events.map((event, index) => (
              <Strata key={event.id} event={event} active={index === activeIndex} />
            ))}
          </div>
          <VerdictBanner view={verdict} />
          {done && <JudgmentLedger calls={collectJudgments(events)} />}
          <div className="river-floor" aria-hidden>
            <span className="river-shimmer" />
          </div>
        </div>
        <aside className="depth-gauge" aria-label="Run depth and elapsed time">
          <div className="gauge-block">
            <PulseNum value={reached} className="gauge-num" />
            <span className="gauge-lab">ledges descended</span>
          </div>
          <div className="gauge-block">
            <span className="gauge-num" aria-live="polite">{elapsed}</span>
            <span className="gauge-lab">elapsed</span>
          </div>
          <div className={`gauge-status ${running ? 'is-live' : ''}`}>
            <span className={`dot ${running ? 'open' : 'closed'}`} aria-hidden />
            {running ? 'descending' : 'at rest'}
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}

/**
 * The horizon header: a sky window above the strata where the living atmosphere
 * (sun, clouds, bird, mesas) is fully visible — the canyon rim the run descends
 * from. It carries a small instrument-style readout so the band stays useful,
 * not purely decorative, and announces the signature "sun sets" verdict beat.
 */
function CanyonHorizon({ running, done, phase }: { running: boolean; done: boolean; phase: SkyPhase }) {
  const label = done
    ? phase === 'error'
      ? 'Sundown · regression caught'
      : phase === 'repaired'
        ? 'Sundown · repaired & guarded'
        : 'Sundown · run complete'
    : running
      ? 'Descending the canyon…'
      : 'Canyon rim';
  return (
    <div className="canyon-horizon" aria-hidden>
      <span className="horizon-rule" />
      <span className={`horizon-label ${done ? 'is-done' : ''}`}>{label}</span>
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
        {/* A persistent live beacon pinned to the in-flight ledge: a breathing
            sun-gold pip + label so even a frozen frame lands the eye on exactly
            which layer the run is working right now (the scan sweep alone is
            transient and can be mid-fade in a still). Reduced-motion holds the
            pip solid (see theme.css). */}
        {active && (
          <span className="strata-live" role="status">
            <span className="strata-live-pip" aria-hidden />
            live · working
          </span>
        )}
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
  repair?: { safeToApply?: boolean; reason?: string; diff?: string; category?: string };
  repairApplied?: boolean;
  scenarios?: Scenario[];
}

/**
 * Build the judgment ledger for the history view from the archived report.json.
 * The report carries the regression diagnosis (refused) and the repair proposal
 * (reason + diff) for the safe drift — the same evidence the live view shows,
 * minus the before/after screenshots which are event-only. All real data.
 */
function judgmentsFromReport(report: PastReport): JudgmentCall[] {
  const calls: JudgmentCall[] = [];
  const repaired = (report.scenarios ?? []).find((s) => s.repairApplied);
  if (report.repair || repaired) {
    calls.push({
      kind: report.repairApplied ? 'repaired' : 'refused',
      category: report.repair?.category ?? repaired?.diagnosis ?? 'UI_COPY_CHANGE',
      title: 'Safe drift',
      verdict: report.repairApplied ? 'auto-repaired' : 'left as-is',
      detail: report.repair?.reason,
      diff: report.repair?.safeToApply ? report.repair?.diff : undefined
    });
  }
  if (report.diagnosis && report.diagnosis.category === 'PRODUCT_REGRESSION') {
    calls.push({
      kind: 'refused',
      category: report.diagnosis.category,
      title: 'Product regression',
      verdict: 'repair refused',
      reason: report.diagnosis.reason
    });
  }
  return calls;
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
      note: 'A real product regression was detected; the test was not weakened.',
      done: true
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
        : 'Safe copy-change auto-repaired.',
      done: true
    };
  }
  return {
    tone: 'guarded',
    mark: 'info',
    headline: 'Run complete',
    category,
    note: report.repair?.reason ?? 'No repair was required.',
    done: true
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
        <CarvedState tone="error" head="Couldn’t load this expedition" sub={error} />
      </div>
    );
  }
  if (!report) {
    return (
      <div className="panel hero">
        <CarvedState head="Reading the expedition log…" sub="Recovering the recorded descent." />
      </div>
    );
  }

  const scenarios = report.scenarios ?? [];
  const title = runId.replace(/^demo-/, '').replace(/T/, ' ').replace(/-\d+Z$/, '');

  const depth = scenarios.length;
  const pastVerdict = verdictFromReport(report);
  const phase: SkyPhase = pastVerdict ? verdictFor(pastVerdict).phase : 'idle';
  return (
    <div className="canyon-pane">
      <div className="past-head">
        <h2 className="past-title">{title}</h2>
        {report.intent?.name && <span className="past-spec">{report.intent.name}</span>}
      </div>
      <div className="canyon-shell run-complete">
        <CanyonAtmosphere progress={1} phase={phase} />
        <CanyonHorizon running={false} done phase={phase} />
        <div className="canyon-grid">
        <div className="canyon-spine-col" aria-hidden>
          <CanyonSpine total={depth} reached={depth} rows={Math.max(24, depth * 3)} active={false} />
        </div>
        <div className="canyon-main">
          <div className="canyon">
            {scenarios.length === 0 && <p className="muted strata-empty">No scenario detail recorded for this run.</p>}
            {scenarios.map((scenario) => (
              <ScenarioStrata key={scenario.name} scenario={scenario} />
            ))}
          </div>
          <VerdictBanner view={pastVerdict} />
          <JudgmentLedger calls={judgmentsFromReport(report)} />
          <div className="river-floor" aria-hidden>
            <span className="river-shimmer" />
          </div>
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
        <CarvedState tone="error" head="Couldn’t load the survey journal" sub={error} />
      </div>
    );
  }
  if (!docs) {
    return (
      <div className="panel hero">
        <CarvedState head="Opening the survey journal…" sub="Gathering documented flows." />
      </div>
    );
  }
  return (
    <div className="panel tablet docs">
      {/* Survey-journal masthead: the Living Docs header reads as the cover plate
          of a field survey-journal, with the WRITE-TO-REPO action stamped beside it. */}
      <div className="docs-masthead">
        <span className="docs-masthead-glyph" aria-hidden>
          <ChromeGlyph name="quill" size={22} />
        </span>
        <div className="docs-masthead-text">
          <span className="docs-kicker">Survey journal · living docs</span>
          <h2 className="docs-title">{docs.project.name}</h2>
        </div>
        <button className="docs-write-btn" onClick={onWrite}>
          ▾ Write to repo
        </button>
      </div>
      <div className="docs-masthead-rule" aria-hidden />
      {written && (
        <p className="docs-written" role="status">
          <span className="docs-written-stamp" aria-hidden>✓</span>
          {written}
        </p>
      )}
      {docs.flows.length === 0 ? (
        <CarvedState head="No flows documented yet" sub="Log a story in the Field Log to chart this project’s first flow." />
      ) : (
        <div className="doclist">
          {docs.flows.map((flow) => (
            <article className="flow-tablet" key={flow.storyId}>
              <header className="flow-head">
                <h3 className="flow-title">{flow.title}</h3>
                <span className={`flow-stamp flow-stamp-${storyKind(flow.status)}`}>
                  <StatusMark status={storyKind(flow.status)} size={12} />
                  {flow.status}
                </span>
              </header>
              <div className="flow-rule" aria-hidden />
              <dl className="flow-meta">
                <div className="flow-meta-cell">
                  <dt>Flow · source</dt>
                  <dd>{flow.source}</dd>
                </div>
                <div className="flow-meta-cell">
                  <dt>Backed by</dt>
                  <dd><code>{flow.testRef}</code></dd>
                </div>
              </dl>
              <p className="flow-instr">{flow.instructions}</p>
              <div className="flow-steps-head" aria-hidden>Field notes</div>
              <ol className="flow-steps">
                {flow.steps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
