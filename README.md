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

## Roadmap

The MVP uses direct Playwright APIs for browser control. Future extension points include:

- Playwright MCP as an optional browser-control backend for agent-tool demos.
- Vision-assisted diagnosis for screenshot comparison and ambiguous UI analysis.
- GitHub Actions and PR creation with before/after artifacts.
