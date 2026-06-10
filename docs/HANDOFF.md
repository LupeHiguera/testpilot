
# testpilot — session handoff / restart notes

_Read this first in a fresh session, then `git log --oneline -25` for the trail._

## What testpilot is
An agentic QA tool: plain-English story → Playwright test → run → diagnose →
**repair only safe UI drift, refuse real product regressions** (so a green suite
stays meaningful). A commander CLI + a live "Grand Canyon" SSE dashboard
(`npm run serve` → :4000); `mock` (default) and `openai` (vision-assisted) modes;
GitHub/Jira MCP story ingestion; living docs. See `README.md` for the full picture.

## Current state (2026-06-10)
- **Everything is committed & pushed.** `origin/main` is current; `git log --oneline`
  for hashes. Local-only drafts (`Draft.md`, `.snap.mjs`, `.vs/`) are git-ignored via
  `.git/info/exclude` — they will not stage even under `git add -A`.
- **CI is green** and now includes a real **perf-budget gate** (`npm run perf:budget`,
  `tools/perf-budget.ts`): boots the server, drives a full run, fails the build if
  initial load / idle DOM / full-run DOM exceed `PERF_BUDGET` (`ui/src/runModel.ts`).
- **The UI converged to a 10/10** on the coder↔grader rubric (iter 30). The signature
  pieces: the day→sundown living canyon, the descending **strata staircase**, the
  **Judgment Ledger** verdict moment (before/after plates + inline diff + stamped seal),
  carved "field-tablet" chrome everywhere, and a persistent **live beacon** on the
  in-flight ledge. (The old full-bleed "gorge" over-reach was rolled back long ago.)
- **Backend is stable and freshly audited (2026-06-10).** The safety core is the
  strongest part: `validatePatch` only loosens toward refusal; `mergeVisionDiagnosis`
  lets vision veto but never authorize. A full audit fixed three real bugs
  (`7c8229f`) and closed the whole nit backlog (`13a895f`) — see the session log below.
- **Tests:** 86 unit tests (incl. `server.test.ts` pinning path-traversal / CSRF /
  body-cap / CORS-absence, plus `runLock` and `waitForServer` backoff).
  `npm run validate` = typecheck (both apps) + tests.

## Session log 2026-06-09/10 (audit + hardening + UX polish)
- **Audit fixes (`7c8229f`):** (1) `GET /api/stories?projectId=../../..` could walk
  the stories join out of `.testpilot/projects` — project ids are now slug-validated
  in `stories/store.ts` (hard guard) and the server returns a clean 400; (2) a demo-
  server failure after `triggerStory`'s 202 crashed the whole live server (write on
  a finished response → unhandled rejection) — post-202 failures are log-only and
  `sendJson` no-ops once headers are sent; (3) the mock generator only escaped the
  FIRST `/` of `expectedPath`, so multi-segment routes emitted a syntactically
  invalid test — all slashes + regex specials now escaped (`pathRegexSource`), and
  `validatePatch` un-escapes `\/` before its route-preservation check.
- **Backlog closeout (`13a895f`):** dropped `Access-Control-Allow-Origin: *` from
  the JSON API + SSE (dashboard is same-origin; Vite dev proxies — pinned by test);
  new `src/server/runLock.ts` serializes runs (`POST /api/run|stories` → 409 while
  one is in flight); `widenSubmitLocator` picks the relabel candidate by bigram
  similarity and skips labels the test already drives; PR bundles are only written
  when the applied repair re-ran green; `waitForServer` backs off on every failed
  attempt (was hot-looping on non-ok) and takes a timeout param; shared
  `src/generator/createPatch.ts` replaces the duplicated pseudo-diff helper.
- **409 toast (`0de93b1`):** the dashboard surfaces refused triggers — `triggerRun`/
  `uploadStory` return `{ started, error }`, and a refusal (run lock 409, 400, dead
  server) shows a carved `.rim-toast` chip (polite live region, shape-coded "!" mark,
  5s auto-dismiss + ×, reduced-motion gated, keeps typed story text). axe stays 0
  with the toast visible.
- **Type fix + hook fix (`35d65bc`):** `0de93b1` broke `typecheck:ui`
  (`useRef<number>()` needs an explicit initial value under `@types/react` 19) and
  its CI run FAILED — masked locally by piping build output through `tail` (pipeline
  exit = tail's 0). Fixed the ref, and the Stop validate hook now writes combined
  output to `/tmp/testpilot-validate.log` and emits the last 40 lines on **stderr**
  before exiting 2, so a blocked stop states the actual error instead of
  "No stderr output". **Lesson: never pipe a verdict command through `tail`/`head` —
  check its exit code directly.**

## How to run / verify
- `npm run validate` · `npm run build` · `npm run test` · `npm run perf:budget`
- `npm run ui:build && npm run serve` → http://127.0.0.1:4000 (press **Run demo**)
- CLI: `npm run testpilot -- demo --mode mock`; `project add|list|add-source`,
  `spec add|pull|pull-jira`, `docs <project>`, `serve`.

## The graded coder↔grader loop (how the UI was iterated)
- MCP grader server `tools/grader-mcp/` (rubric in `rubric.ts`, 0–10). Client harness
  `tools/grader-mcp/harness.mjs capture|record`. Grades log to `grading/` (gitignored).
- Loop: edit `ui/` → `npm run ui:build` → harness `capture` (drives a live run at
  1440/768/375 + axe/console/metrics) → an **Opus grader subagent** grades →
  `record`. **User preference: Opus for all subagents** (Sonnet under-reads stills).
- Gotcha: the standard capture waits for the run to FINISH, so streaming-only states
  (the active-ledge beacon, focus rings) need a mid-run capture to be evidenced.
- The server keeps serving fresh `ui/dist` after a rebuild (no restart needed).

## Key files
- UI: `ui/src/App.tsx` (all views), `ui/src/theme.css` (the design system — big),
  `ui/src/runModel.ts` (the tested read-layer + `PERF_BUDGET`), `CanyonAtmosphere.tsx`,
  `CanyonSpine.tsx`, `PixelSprites.tsx`, `PixelWordmark.tsx`.
- Backend: `src/server/server.ts` (SSE + API + guards), `src/pipeline/{demo,story}.ts`,
  `src/diagnosis/*` (classifier + vision), `src/repair/validatePatch.ts` (the guardrail),
  `src/mcp/client.ts` (+ http/sse transport), `src/connectors/{github,jira}.ts`.

## Roadmap (next, in priority order)
1. **Phase 1 — generalize diagnosis + repair (DONE).** Diagnosis derives app-agnostic
   structured signals (`src/diagnosis/failureSignals.ts`): it parses *which assertion
   failed* and *which control the test reached for* from the Playwright error
   (stripping the echoed source so a later `toHaveURL` line can't masquerade as the
   failure) and reads the re-observed page — no longer keyed on `intent.submitText`.
   A failed outcome assertion is always a refused regression; only a control-lookup
   drift is repairable. The mock `proposeRepair` now widens whichever
   `getByRole('button', { name })` the test drives whose label is gone from the
   page's CURRENT buttons (from the loop's fresh observation) to a role locator
   matching both old and current — a copy-change is repaired on ANY flow, and no
   repair is fabricated when nothing maps. Known limit: the relabel repair sources
   new labels from `observation.buttons`, so non-button controls (links) need the
   artifact collector to capture them first.
2. **Phase 2 — close the connected-repo loop (CORE DONE, 2026-06-10).** Safe repairs
   flow into a connected project's own repo: `validatePatch` scopes writes to the
   project's tests dir (`allowedTestsRoot` — still strict tests-dir containment,
   never a repo root); external tests run INSIDE the connected repo with its own
   Playwright toolchain (`runPlaywrightTest` `repoRoot` — testpilot's runner +
   the repo's `@playwright/test` would double-load and crash); a green repair is
   bundled as a PR in the run dir always and opened as a real branch + GitHub PR
   with `spec add --open-pr` (`createRepairPr` `repoRoot`, original branch
   restored afterwards). Verified live against a registered external repo + the
   copy-change demo app. REMAINING: live-verify the `--open-pr` path against a
   real GitHub remote (the no-remote bundle fallback is tested); the dashboard
   story form has no open-PR control (bundle-only there); a connected repo must
   have `@playwright/test` installed for `runnable: true`.
3. **Phase 3 — connectors (HARDENED, 2026-06-10).** `callToolText` throws on
   tool-level MCP errors (a private repo / bad token reads as what it is, not a
   JSON.parse crash or empty list); GitHub paginates (`page`/`per_page` default,
   param names configurable — the reference and official servers disagree) up to
   a `maxIssues` cap; Jira flattens v3 ADF descriptions (`adfToText`) and pages
   the REST search envelope via `startAt`. Both connectors are exercised
   end-to-end over a REAL stdio MCP connection in
   `tests/integration/connectors.test.ts` (fixture server in `tests/fixtures/`).
   REMAINING: a genuinely live Jira verification needs a real Atlassian MCP
   endpoint + token (user-supplied) — run `spec pull-jira` against it; `spec pull`
   builds its GitHub config from CLI flags only (does not yet read the project's
   stored github source config).
4. **Phase 4 — productionize the dashboard (DONE, 2026-06-10).** The perf DOM
   budgets are scoped to the live canyon pane (`.canyon-pane`: idle ≤ 200,
   full run ≤ 4500 — measured ~28/~3053), so the Expeditions history rail (which
   grows with the local run archive) can't inflate them; whole-page totals are
   reported ungated for trend tracking, and `perf:budget` appends a markdown
   results table to the GitHub Actions job summary. Auth stays out of scope
   while the server binds to 127.0.0.1 only.

## Watch-outs
- Kill stray servers: PowerShell `Get-NetTCPConnection -LocalPort 4000,3000 -State
  Listen | Select -Expand OwningProcess -Unique | Stop-Process -Force`.
- README has 3 screenshots in `docs/` (`dashboard.png`, `canyon-vista.png`,
  `docs-view.png`); refresh them if the UI changes materially (`docs/_shots.mjs` pattern).
