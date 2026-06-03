# testpilot
Turns plain-English QA instructions into Playwright tests, then diagnoses and repairs failures while preserving test intent.

## MVP

testpilot is a CLI-first agentic QA prototype. The current MVP includes:

- A Vite React demo app with `/login` and `/dashboard`.
- A TypeScript CLI for generating, running, diagnosing, and repairing Playwright tests.
- Deterministic mock mode for local development and CI.
- Optional OpenAI mode using `OPENAI_API_KEY`.
- Failure classification for safe UI drift versus product regression.
- Auto-application of safe repairs only inside `tests/generated/`.

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

```bash
$env:OPENAI_API_KEY = "..."
npm run testpilot -- demo --mode openai --model gpt-5.5
```

Mock mode remains the deterministic default.

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

## Roadmap

The MVP uses direct Playwright APIs for browser control. Future extension points include:

- Playwright MCP as an optional browser-control backend for agent-tool demos.
- Vision-assisted diagnosis for screenshot comparison and ambiguous UI analysis.
- Pushing repair PRs automatically from CI with uploaded before/after artifacts (local bundle + `--open-pr` exist today).
