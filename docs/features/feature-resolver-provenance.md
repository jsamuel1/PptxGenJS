# Feature: Consistent resolver provenance (`source` on every result)

> **Status:** Proposed
> **Priority:** Medium — lets consumers distinguish a real resolution from a fallback.
> The downstream converter's provenance report
> (`../html-to-pptx/docs/features/feature-conversion-provenance-report.md`) consumes
> this. Source: 2026-06-14.

## Problem

Provenance exists but is inconsistent, so a consumer can't uniformly tell "resolved"
from "fell back":

- `resolveIconFonts` → each `ResolvedSvgPart` has `source: IconSource`
  (`'css-content'|'font-file'|'cdn'|'bundled'|'custom'`) — good.
- `extractThemeFromCSS` → `presetName` ('extracted' | a preset | fallback) — good, but
  per-slot ("was `accent` extracted or defaulted?") is unavailable.
- `resolveFontFiles` (new) → returns matched files but no explicit "matched by name
  table vs not found" signal beyond presence/absence.
- `parseCards`/`parseTimeline`/… → no signal for "detected structurally" vs "fell
  through to a class-name/heuristic match" vs "nothing found".

## Proposal

A small, uniform convention — not a rewrite:

1. Each resolver result carries an optional `source`/`provenance` tag from a shared
   vocabulary: `'exact' | 'structural' | 'heuristic' | 'fallback' | 'default' |
   'missing'`. `resolveIconFonts` keeps its richer `IconSource` (map it onto the
   coarse vocabulary for aggregation).
2. `extractThemeFromCSS`: add per-slot origin alongside `presetName` —
   `slotSource?: Partial<Record<keyof ThemePalette,'extracted'|'derived'|'preset'>>`
   so a consumer sees which colours are real vs preset.
3. `resolveFontFiles`: result includes `{ matchedBy: 'name-table' | 'none' }` per
   family (the converter's report needs resolved-vs-missing).
4. Document the convention in each function's typedoc so it's a contract consumers can
   rely on; the API-parity test already guards the typings.

This is additive (new optional fields) — default-off invariant holds; existing callers
ignore the new fields.

## Acceptance criteria

1. `resolveFontFiles(dir,['Inter'])` result distinguishes resolved (`matchedBy:
   'name-table'`) from a family that wasn't found.
2. `extractThemeFromCSS` on a deck with only `--bg`/`--text` reports `accent` as
   `preset`-sourced, `bg` as `extracted`.
3. The coarse `source` vocabulary is documented in typings for every resolver; parity
   green; CHANGELOG `### Added` (additive fields, no break).

## Coordination

Downstream converter maps these into its `ctx.report` provenance entries. No release
ordering constraint beyond "before the converter's report can show library-sourced
provenance".
