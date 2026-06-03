# testpilot
Turns plain-English QA instructions into Playwright tests, then diagnoses and repairs failures while preserving test intent.

## MVP

testpilot is a CLI-first agentic QA prototype. The current MVP includes:

- A Vite React demo app with `/login` and `/dashboard`.
- A TypeScript CLI for generating, running, diagnosing, and repairing Playwright tests.
- Deterministic mock mode for local development and CI.
- Optional OpenAI mode using `OPENAI_API_KEY` (verified end-to-end).
- Failure classification for safe UI drift versus product regression.
- Optional vision-assisted diagnosis (`--vision`) under a strict safety invariant.
- Auto-application of safe repairs only inside `tests/generated/`.
- Reviewable repair PR bundles, with optional one-command GitHub PRs (`--open-pr`).

## Install

```bash
npm install
npm run playwright:install
```

## Run The Demo

```bash
npm run testpilot -- demo --mode mock
```

The demo starts the local app, generates a login test, runs it against the normal app, verifies a safe button-copy repair for the copy-change variant, and refuses to repair the regression variant.

Focused commands are also available:

```bash
npm run testpilot -- generate examples/login-spec.md --base-url http://127.0.0.1:3000
npm run testpilot -- run tests/generated/login.spec.ts --base-url http://127.0.0.1:3000
npm run testpilot -- diagnose runs/<run>/run-result.json examples/login-spec.md
npm run testpilot -- repair tests/generated/login.spec.ts runs/<run>/run-result.json examples/login-spec.md
```

## OpenAI Mode

Set `OPENAI_API_KEY` (the same key powers `--vision`). Per session in PowerShell, or
persist it with `setx OPENAI_API_KEY "..."` and restart the shell:

```bash
$env:OPENAI_API_KEY = "..."
npm run testpilot -- demo --mode openai --model gpt-5.5
```

Mock mode remains the deterministic default; OpenAI mode is verified end-to-end
(generation, repair, and vision diagnosis) and degrades gracefully back to mock
behavior when a call fails.

## Vision-Assisted Diagnosis

Pass `--vision` to `diagnose` or `repair` to refine the failure classification with
a model's read of the failure screenshot:

```bash
npm run testpilot -- diagnose runs/<run>/run-result.json examples/login-spec.md --vision --mode openai
```

The deterministic heuristic classifier remains the floor. Vision is merged under a
strict safety invariant: **it can veto a repair but never authorize one the
heuristics did not already allow** — a result is repairable only when both the
heuristic and the vision category agree it is safe drift. In mock mode the vision
step concurs deterministically, so demos and CI stay reproducible.

## Repair Pull Requests

When a safe repair is applied, testpilot assembles a reviewable PR bundle under the
run directory (`runs/<run>/pr/`) containing:

- `pr-body.md` — summary, diagnosis, the unified diff, before/after screenshots, and a human-approval checklist.
- `pr-meta.json` — proposed branch name, title, and base branch.
- `repaired-test.ts` — the full repaired test.
- `before.png` / `after.png` — failing vs. repaired state.

By default nothing is pushed. To open a real GitHub PR (requires `gh` and an `origin` remote):

```bash
npm run testpilot -- repair tests/generated/login.spec.ts runs/<run>/run-result.json examples/login-spec.md --open-pr
```

If `gh` or a remote is missing, testpilot falls back to writing the local bundle and reports why.

## Validation

```bash
npm run validate       # typecheck + unit tests
npm run validate:demo  # validate, then run the full mock demo end-to-end
```

CI runs the same checks plus the demo on every push/PR (`.github/workflows/ci.yml`).

## Live View

A Grand Canyon pixel-art dashboard streams a run stage-by-stage — each pipeline
stage forms a "canyon stratum" that reveals its evidence (screenshot, diagnosis +
reasoning, diff, verdict) as events arrive over Server-Sent Events.

```bash
npm run ui:build      # build the dashboard (ui/ -> ui/dist)
npm run serve         # then open http://127.0.0.1:4000 and press "Run demo"
```

The server (`src/server`) exposes `GET /events` (SSE), `GET /api/runs`,
`GET /artifacts/*` (sandboxed to `runs/`), and `POST /api/run`. The pipeline emits
stage events through a process-local bus (`src/events`) that is a no-op for the
plain CLI and gains the SSE sink only under `serve`. The dashboard is a standalone
Vite/React app in `ui/`; `npm run ui:dev` runs it with a dev proxy to the server.

## Graded UI Workflow

The dashboard was built and held to a bar by a two-agent loop: a **coder** agent
implements the UI, and a **grader** agent scores it against a fixed rubric using a
real **MCP server** (`tools/grader-mcp/`) for objective evidence.

- `capture_ui` — multi-viewport screenshots (returned inline so the grader's vision sees them)
- `run_ui_checks` — axe-core accessibility violations, console errors, metrics
- `record_grade` — appends per-criterion scores to `grading/grades.jsonl`
- `rubric://testpilot-ui` — the 7-criterion rubric (design-system rigor, evidence
  altitude, real-data fidelity, live-ness, accessibility, theme craft, engineering)

The server is registered in `.mcp.json`; `tools/grader-mcp/harness.mjs` is the MCP
client that drives a grading round. The rubric explicitly penalizes the "vibe-coded"
look (generic gradients, emoji-as-UI, component-kit defaults, fake data) and a repair
only counts as passing when every criterion scores ≥ 3.

## Platform: connected projects, story ingestion & living docs

Beyond the bundled demo, testpilot can drive **connected projects** and ingest
plain-English testing stories from multiple sources, then generate tests (and docs)
for them.

```bash
# Register a connected project (generated tests/docs land in its repo)
npm run testpilot -- project add acme --name "Acme web" --repo /path/to/acme \
  --base-url http://127.0.0.1:5173 --tests-dir tests/e2e

# Upload a story and run it (CLI or the dashboard's Stories panel)
npm run testpilot -- spec add acme ./story.md

# Pull stories from GitHub via the GitHub MCP server (token from GITHUB_TOKEN or gh)
npm run testpilot -- spec pull acme --owner acme --repo web --label needs-test --generate

# Pull from Jira via a configured Jira MCP server (sources[].config.mcp + jql)
npm run testpilot -- spec pull-jira acme --jql "labels = needs-test"

# Generate living documentation (per-flow markdown backed by tests) into the repo
npm run testpilot -- docs acme
```

Connectors run testpilot as an **MCP client** (`src/mcp/client.ts`) to the official
GitHub / Atlassian MCP servers; the server launch is configurable per source. Living
docs tie each flow to its test, so a failing status flags documentation that no longer
matches the product. Arbitrary-app test generation is best-effort and keeps the
human-approval gate; the project registry lives in a gitignored `.testpilot/`.

## Roadmap

The MVP uses direct Playwright APIs for browser control. Future extension points include:

- Playwright MCP as an optional browser-control backend for agent-tool demos.
- Pushing repair PRs automatically from CI with uploaded before/after artifacts (local bundle + `--open-pr` exist today).
- Richer vision diagnosis: side-by-side expected-vs-actual screenshot comparison (single-screenshot classification exists today via `--vision`).
