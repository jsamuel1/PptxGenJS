# 0003 — Typings are hand-maintained with enforced API parity

- **Status:** Accepted
- **Date:** 2026

## Context

`package.json#exports` points at hand-maintained `types/*.d.ts` rather than
compiler-generated declarations. That made "shipped but untyped" a recurring
incident class: `decodeEntities`, the css-context layout helpers, and
`tokenizeCode`/`codeRuns` each shipped exported-but-undeclared (or neither),
leaving the API unreachable for TypeScript consumers while tests stayed green.

## Decision

Keep the typings hand-maintained (they are the curated public contract), and
enforce parity mechanically: `test/feature-api-parity.test.js` fails when
`types/utils.d.ts` and the runtime exports of the built entry disagree in
either direction.

## Consequences

- A new public API is a four-part change by definition: export, typing,
  public-entry test, end-to-end consumability check (CONTRIBUTING
  "Definition of done — public API").
- The .d.ts stays readable and intentional — nothing leaks into the public
  surface by accident of compilation.
- The parity test is a permanent gate; "green but not in typings" can no
  longer ship silently.
