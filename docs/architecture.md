# testpilot Architecture

testpilot is a CLI-first agentic QA prototype. It converts plain-English test instructions into structured intent, observes a target page with Playwright, generates a Playwright test, runs it, classifies failures, and repairs generated tests when the failure is safe drift.

The MVP uses direct Playwright APIs for deterministic browser control. Playwright MCP and vision-assisted diagnosis are planned extension points, not v1 browser-control dependencies.
