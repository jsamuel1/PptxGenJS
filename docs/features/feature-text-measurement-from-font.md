# Feature: Text measurement from font metrics (not char-count guesses)

> **Status:** Proposed
> **Priority:** Medium — unlocked by `feature-font-family-resolver.md` (same font
> parser); fixes a real Goal-#1 break (CJK/wide-glyph overflow). Source: 2026-06-14
> hardcode sweep.

## Problem

Auto-sizing guesses text width as a fixed inches-per-character constant — Latin glyph
metrics baked in, wrong for any non-Latin script:

- `gen-objects.ts:1312` `addBadge` width `0.1 * text.length + 0.1`
- `gen-objects.ts:1314` `addCard` badge width `0.1 * text.length + 0.2`
- `gen-objects.ts:1767` `fit:'fill'` font size `(w*72)/(textLength*0.6)`
- (downstream mirrors: `html-to-pptx/src/renderers.js:287,784` `0.12*len+0.3`)

A CJK badge ("設定" ≈ full-em glyphs) is sized as if 2 narrow Latin chars and overflows;
a wide title underflows. The authoritative source is the font's own glyph advance
widths — the `hmtx`/`hhea`/`head` tables in the very font files
`feature-font-family-resolver.md` will already be parsing.

## Proposal

1. Extend the font parser (from the resolver spec) to expose advance widths:
   `measureTextWidth(text, { family?, fontFile?, fontSize, fallbackEmFactor? })` in
   `/utils` — sum per-glyph `hmtx` advances scaled to the point size; return inches.
   When no font file is resolvable, fall back to **script-aware** average em-factors
   (CJK/fullwidth ≈ 1.0em, Latin ≈ 0.5em, via Unicode block) — already far better than
   one Latin constant.
2. `addBadge`/`addCard`/`fit:'fill'` use it instead of `0.1*length`. Default-off
   safe: identical numeric output for pure-Latin ASCII at the current constant is not
   required (auto-width is a hint PowerPoint re-lays-out), but the value must never be
   *smaller* than the text needs.

## Acceptance criteria

1. `measureTextWidth('設定', {fontSize:12})` > `measureTextWidth('ab', {fontSize:12})`
   (CJK wider than 2 Latin), executed against the public entry.
2. A CJK badge auto-width ≥ its rendered glyph run (no clip) — assert via the measured
   width, no network.
3. Pure-ASCII badge widths stay within ±10% of today's output (no Latin regression).
4. API parity green; CHANGELOG `### Changed`.

## Coordination

Built on `feature-font-family-resolver.md`'s parser — sequence after it. The converter
drops its own `0.12*len` guesses and calls this once available.
