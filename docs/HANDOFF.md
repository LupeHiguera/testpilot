# testpilot — session handoff / restart notes

> ## UPDATE — 2026-06-04 (later session): gorge rolled back + 10 loops run
> **The over-reach below is RESOLVED.** Option A was executed: the full-bleed
> `CanyonGorge` was deleted (component + `<CanyonGorge/>` in App.tsx + the gorge
> CSS block & `.layout` margins in theme.css), keeping the field-tablet chrome +
> sundown hero. Build green, 37 tests pass, axe-0.
> Then **10 coder↔grader loops (iters 14–23)** pushed the whole site from avg **7.3 → 9.0**:
> | criterion | 13 (base) | 23 (final) |
> |---|---|---|
> | wow_factor | 7 | 8 |
> | theme_craft | 7 | **10** |
> | evidence_altitude | 6 | 9 |
> | liveness | 7 | 9 |
> | real_data | 8 | 9 |
> | design_system | 7 | **10** |
> | accessibility | 8 | 9 |
> | engineering | 8 | 8 |
>
> Key additions over the run: a **Judgment Ledger** verdict moment (real before/after
> plates + inline diff + color-keyed stamped seal: rust=refused/teal=repaired/gold=guarded),
> carved Expeditions ledger with per-row verdict cue + selected-row "why", carved topbar
> (tabs + project select) with a teal live-LED, carved diff block, form focus micro-motion,
> ambient sheen, and on-theme empty/error/reconnect states.
> **Harness change:** `tools/grader-mcp/harness.mjs capture` now drives a live run at ALL
> three viewports (1440/768/375), not just 1440.
> **Still capping (both at 8):** `wow_factor` (long strata column is uniform row-to-row —
> wants an altitude/lighting progression or milestone-step treatment) and `engineering`
> (wants a stated perf budget / visible read-layer test coverage).
> **Committed (this session, on `main`):** the rollback + 10 loops + the all-viewport harness
> change landed as one UI commit; a follow-on commit adds the agentic-core repair loop
> (`src/repair/repairLoop.ts` — bounded re-observe retry). `Draft.md`/`.snap.mjs` stay untracked.
>
> _Everything below is the PRIOR handoff that prompted the rollback — kept for context._

---

_Written 2026-06-04 because the context window filled (94%) and the UI direction
over-reached. Read this first in a fresh session, then `git log --oneline` for hashes._

## What testpilot is
An agentic QA tool: plain-English story → Playwright test → run → diagnose →
**repair only safe drift, refuse real regressions**. CLI + a live "canyon" dashboard
(`npm run serve` → :4000), mock + OpenAI modes, GitHub/Jira MCP story ingestion,
living docs. All on `main`, CI green. See README.md for the full picture.

## Everything is committed & pushed
`origin/main` is current. `Draft.md` stays untracked on purpose. Use
`git log --oneline -25` to see the trail. Key UI milestones (by commit message):

1. **"Wow factor: a living canyon that ages day to sundown as a run descends"** —
   the polished LIVE-VIEW hero (day→sundown sky, verdict moment). **Coherent, strong.**
2. **"Rescale rubric to 0-10, grade the whole site (anchor current at 5)"** — start of
   the whole-site "wow the chrome" campaign.
3. Chrome loops → sidebar/forms/docs/history became carved **"field tablet"** panels,
   etched inputs, stamp tags. **This was good** (Opus grade ~7.6, cohesive).
4. **"WIP: put the whole app inside a canyon gorge"** → **"Canyon gorge: dramatic
   formations + showpiece river floor"** → **"Reveal canyon formations ... at desktop"**
   (latest, `34dc7bf`). Full-bleed canyon WALLS now wrap the whole viewport. **This is
   the over-reach** — ambitious but it complicated the layout and is hard to judge.

## Honest assessment (why it feels off the rails)
The **field-tablet chrome + sundown live-view hero was the sweet spot.** The later
**full-viewport gorge walls** (CanyonGorge.tsx framing the entire site) added a lot of
visual weight around the content and never quite read as "dramatic canyon" at desktop
without fighting the layout. Recommend pulling back to the field-tablet state.

## Restart options (pick one in the fresh session)
- **A (recommended): drop the gorge backdrop, keep the field-tablet chrome + sundown
  hero.** Revert just `ui/src/CanyonGorge.tsx` + its `.layout`/gorge styles in
  `ui/src/theme.css` (remove the full-bleed walls), keeping the carved panels, etched
  inputs, stamp tags, and the live-view sundown canyon. That's the "good before."
- **B: keep the gorge but simplify** — make it a quiet ambient frame, not a literal
  walls-everywhere scene.
- **C: continue refining the gorge** (last grader note: formations too small/high at
  desktop, lower-wall flat, waterfall static). Higher effort, uncertain payoff.

To roll back the gorge specifically: `git log --oneline` → find the commit BEFORE
"WIP: put the whole app inside a canyon gorge", and `git checkout <that>^ -- ui/src/CanyonGorge.tsx`
(it won't exist → delete it) and revert the gorge-related blocks in `ui/src/theme.css`
and the CanyonGorge usage in `ui/src/App.tsx`. Then `npm run ui:build`.

## How to run / verify
- `npm run validate` (typecheck + 37 unit tests) · `npm run build` · `npm run test`
- `npm run ui:build && npm run serve` → http://127.0.0.1:4000 (press Run demo)
- CLI: `npm run testpilot -- demo --mode mock`; `project add|list`, `spec add`,
  `spec pull/pull-jira`, `docs <project>`, `serve`.

## The graded coder↔grader loop (how the UI was iterated)
- MCP grader server: `tools/grader-mcp/` (rubric in `rubric.ts`, now 0-10; the canyon-hero
  era was 0-4). Client harness: `tools/grader-mcp/harness.mjs`. Grades log: `grading/` (gitignored).
- Loop = spawn an **Opus** coder subagent (edit `ui/`), `npm run ui:build`, screenshot via a
  Playwright capture script, spawn an **Opus** grader subagent (Sonnet under-reads — use Opus),
  record the grade, feed feedback back. **User preference: Opus for ALL subagents.**
- Capture only the top viewport (~880px); the gorge is `position: fixed`, so full-page
  screenshots mislead. Server keeps serving fresh `ui/dist` after a rebuild (no restart needed).

## Key UI files
`ui/src/App.tsx` (layout + all views), `ui/src/theme.css` (the design system — big),
`ui/src/CanyonAtmosphere.tsx` (sundown sky for the live view), `ui/src/CanyonGorge.tsx`
(the over-reach full-bleed walls), `CanyonSpine.tsx`, `PixelSprites.tsx`, `PixelWordmark.tsx`.
Backend pipeline/server/connectors are stable — the open work is purely UI polish.

## Watch-outs
- Anthropic API had transient overloads this session (subagent spawns + the Bash safety
  classifier briefly failed) — retry, it clears.
- Kill stray servers: PowerShell `Get-NetTCPConnection -LocalPort 4000,3000 ... Stop-Process`.
- README has 3 screenshots in `docs/` (dashboard.png = sundown hero, canyon-vista.png,
  docs-view.png). If the UI changes materially, refresh them.
