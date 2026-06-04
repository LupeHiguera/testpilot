# testpilot — session handoff / restart notes

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
