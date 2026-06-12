# 0004 — Tests import the built public entry, never private bundles

- **Status:** Accepted
- **Date:** 2026

## Context

Rollup builds fast test outputs (`src/bld/*`) and published outputs
(`dist/*`) from the same entries. The incident class this guards against:
code reachable from a special test-only bundle but absent from the public
entry — tests green, consumers broken (the css-context layout API shipped
released-but-unreachable this way).

## Decision

Tests exercise the **built public entry** (`src/bld/utils.cjs.js` /
`src/bld/pptxgen.cjs.js` — same entry modules the dist build publishes).
Needing a special rollup entry to make code testable is itself the failure
signal: the code isn't public yet.

## Consequences

- "It works in tests" approximates "it works for consumers" instead of
  diverging from it; end-to-end consumability is still proven via
  `npm run ship` + a require-check for new public APIs.
- Tests require a build step (`npm run build` first) — the verify chain in
  CONTRIBUTING encodes that order.
- The exit code is the only success gate the runner honours; the runner
  validates each test file's exported shape so unwired or malformed tests
  fail loudly (a crashed runner once streamed green-looking output while
  skipping half the suite).
