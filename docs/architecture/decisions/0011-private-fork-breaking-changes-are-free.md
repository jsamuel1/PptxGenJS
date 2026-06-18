# 0011 — Private fork: breaking changes are free; no major-bump or migration ceremony

- **Status:** Accepted
- **Date:** 2026-06-18

## Context

This fork is not published for external consumers — its only real consumer is the
`../html-to-pptx` converter, which lives in the same workspace and is updated in
lockstep. SemVer's purpose (let third parties pin a range and avoid surprise breakage)
does not apply here. Treating every API removal as a major version, with deprecation
windows and migration ceremony, is pure overhead: e.g. the SAU-65 deprecated-alias
removal shipped as a patch (5.0.4) and that is fine, even though the CHANGELOG labels it
"breaking" — there is no one on a `^5` range to break.

## Decision

Breaking changes are free. Remove dead/deprecated surface whenever it's the right call;
**do not** require a major version bump, a deprecation window, or a migration shim for it.
The version number is just a monotonic build marker for the converter's dep pin, not a
SemVer contract. The converter tracks the latest library and adapts in the same change set
(library-first, ADR-0002); its test suite + the cross-repo consumer proof are what protect
us, not version ranges.

## Consequences

- No 6.0.0 ceremony for removals; `bump=patch`/`minor` is fine regardless of breakage.
  (5.0.4 stands as-is.)
- Agents/loops MUST NOT flag "this is breaking → needs a major bump" or propose
  deprecation windows. Breaking is acceptable; just keep the converter green.
- The CHANGELOG may still note "breaking" for human readers, but it carries **no**
  versioning obligation.
- **If this fork is ever published for outside consumers, this ADR must be revisited**
  (revert to real SemVer) before the first public release.
- Cross-repo discipline still holds: a library break is landed together with the
  converter migration (or the converter dep is bumped + verified in the same effort).
