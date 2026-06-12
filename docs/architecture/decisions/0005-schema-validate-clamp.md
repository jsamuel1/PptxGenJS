# 0005 — Every emit is schema-validated; out-of-range inputs clamp, never crash

- **Status:** Accepted
- **Date:** 2026

## Context

OOXML is a strict schema (ECMA-376): wrong child order, an element on the
wrong series type, or an out-of-range value produces a deck PowerPoint
repairs or rejects — and string-level tests don't catch it. A batch of real
chart/gradient emission bugs (invalid `invertIfNegative`, mis-ordered
`varyColors`, out-of-range `holeSize`/gradient stops) shipped before the
schema suite existed to expose them.

## Decision

Every emitted XML change must pass the OpenXML schema validator
(`npm run schema-test`); new behaviour adds a schema fixture. Out-of-range
numeric inputs are clamped to the valid OOXML range before emit — never
emitted verbatim, never thrown on.

## Consequences

- A class of "PowerPoint asks to repair the file" bugs is caught at test
  time; the real-render tier (`test/release/`) covers what schema validity
  alone cannot.
- Clamping is forgiving-but-deterministic API behaviour: callers get a valid
  deck, not an exception, from sloppy inputs.
- Schema fixtures are a permanent cost on every new emit path — accepted as
  the price of the format's strictness.
