# testpilot — session handoff / restart notes

_Read this first in a fresh session, then `git log --oneline -25` for the trail._

## What testpilot is
An agentic QA tool: plain-English story → Playwright test → run → diagnose →
**repair only safe UI drift, refuse real product regressions** (so a green suite
stays meaningful). A commander CLI + a live "Grand Canyon" SSE dashboard
(`npm run serve` → :4000); `mock` (default) and `openai` (vision-assisted) modes;
GitHub/Jira MCP story ingestion; living docs. See `README.md` for the full picture.

## Current state (2026-06-08)
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
- **Backend is stable.** The safety core is the strongest part: `validatePatch` only
  loosens toward refusal; `mergeVisionDiagnosis` lets vision veto but never authorize.
- **Tests:** 64 unit tests (incl. `server.test.ts` pinning the path-traversal / CSRF /
  body-cap guards). `npm run validate` = typecheck + tests.

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
2. **Phase 2 — close the connected-repo loop.** Repairs auto-apply only inside
   `tests/generated/`; generalize safe-apply into an external repo behind the existing
   PR-bundle gate (`src/pr/createRepairPr.ts`).
3. **Phase 3 — connectors:** live-verify Jira (code-complete), harden GitHub for
   private repos / pagination.
4. **Phase 4 — productionize the dashboard:** perf numbers as a CI job-summary; scope
   the perf DOM count to `.canyon-main` so local run-history can't inflate it; auth
   only if it ever leaves localhost.

## Watch-outs
- Kill stray servers: PowerShell `Get-NetTCPConnection -LocalPort 4000,3000 -State
  Listen | Select -Expand OwningProcess -Unique | Stop-Process -Force`.
- README has 3 screenshots in `docs/` (`dashboard.png`, `canyon-vista.png`,
  `docs-view.png`); refresh them if the UI changes materially (`docs/_shots.mjs` pattern).
