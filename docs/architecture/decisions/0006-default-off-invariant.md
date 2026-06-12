# 0006 — New features are default-off; non-participating decks emit byte-identical XML

- **Status:** Accepted
- **Date:** 2026

## Context

The fork adds features continuously while downstream consumers (including the
html-to-pptx converter's golden-baseline tests) depend on stable output. Any
feature that emits without an explicit opt-in changes every consumer's output
and makes regressions indistinguishable from improvements.

## Decision

A presentation that does not use a feature emits byte-for-byte identical XML
to before the feature existed. Every new emit is guarded behind an explicit
opt-in.

## Consequences

- Downstream golden baselines stay meaningful across fork releases; consumers
  upgrade without diff noise.
- Feature work always includes a "without the option, output is unchanged"
  fixture.
- Default behaviour changes, when genuinely warranted, are deliberate
  breaking changes with their own justification — not side effects.
