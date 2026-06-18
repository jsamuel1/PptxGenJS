# 0010 — Balanced workarounds: fixes must solve the general case

> **Status:** Accepted (2026-06-18)

## Context

Workarounds and defaults that overfit to one consumer's specific input shape
cause regressions for other consumers. ADR-0009's audit demonstrated this
concretely: hardcoded palette values and consumer-specific class names
embedded as library defaults broke every other consumer's rendering.

The same pattern applies to bug-fix workarounds: a fix tuned to one known
caller's exact HTML structure may silently fail (or actively corrupt output)
for a different caller's valid input.

## Decision

Every workaround or default must solve the **general case** or be gated
behind an explicit option — no hardcoded consumer-specific values as library
defaults.

## Consequences

- Edge-case fixes that cannot be generalised must be exposed as options with
  documented neutral defaults; the consuming code passes its own value.
- "Just add a special case" shortcuts are blocked — the reviewer must verify
  the fix handles inputs the original reporter didn't provide.
- Forces option-first design: when in doubt, add a parameter rather than a
  hardcoded branch.
- Relates to ADR-0009 (neutral defaults) — 0009 targets aesthetics; this ADR
  targets behavioural workarounds and logic branches.
