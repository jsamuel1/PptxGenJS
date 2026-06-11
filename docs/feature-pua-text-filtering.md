# Feature: PUA-range filtering in text extraction

> **Status:** Proposed
> **Priority:** Medium-High (upstream half of html-to-pptx's
> `feature-text-normalisation-pipeline.md` Layer 2 — the remaining half of the "🎵×"
> glyph-corruption bug class)

## Problem

Icon-font elements (`<i class="fa-music">`, Material/Bootstrap/Ionicon equivalents)
can carry literal Private Use Area codepoints (U+E000–U+F8FF) as text — injected by
SSR, CSS `::before` capture, or framework rendering. `textOf()` (html-dom) returns
them verbatim, so every consumer — `parseCards` titles/descriptions,
`parseTable`/`parseTimeline`/`parseQuote` cell text, and downstream converters walking
the HNode tree — can emit garbage glyphs into PPTX text runs ("🎵×" instead of "7×").
PUA codepoints are never meaningful presentation text: they are glyph indices whose
meaning lives in a font the PPTX does not embed.

Downstream (html-to-pptx) is patching its own counter-detection paths, but every other
`textOf()` consumer remains exposed; the fix belongs where the text is produced.

## Proposal

1. **`textOf(node, opts?)`** gains `{ keepPUA?: boolean }` and **strips
   U+E000–U+F8FF by default** (plus the supplementary PUA planes,
   U+F0000–U+FFFFD / U+100000–U+10FFFD, which arrive as surrogate pairs). Stripping
   by default is the right call: a PUA char in extracted *text* is always icon
   residue; callers that genuinely want raw glyphs (e.g. icon-classify reading a
   captured `::before` content char) pass `keepPUA: true`.
2. **Audit internal callers**: `icon-classify`/`resolve-icon-fonts` read glyph chars
   intentionally → `keepPUA: true` (or read `node.text` directly). The content
   extractors (`parse-cards`, `parse-content`) take the new default.
3. **Collapse whitespace residue**: stripping a glyph between spaces must not leave
   doubled spaces — normalise `/\s{2,}/` → single space in the stripped result only
   when a removal occurred (no behaviour change for PUA-free text).

## Affected files

- `src/utils/html-dom.ts` — `textOf` (strip + opts), shared helper for the PUA test
- `src/utils/icon-classify.ts` / `src/utils/resolve-icon-fonts.ts` — opt out where
  glyph chars are the point
- `types/utils.d.ts` — updated `textOf` signature
- `test/feature-pua-filtering.test.js` (new)

## Acceptance criteria

1. `textOf` on `<div><i class="fa-music"></i>7×</div>` returns `"7×"` (no PUA,
   no doubled whitespace).
2. Surrogate-pair PUA (plane 15/16) is stripped without corrupting adjacent non-PUA
   characters (no lone surrogates in output).
3. `textOf(node, { keepPUA: true })` is byte-identical to today's behaviour.
4. `parseCards` on a card whose `<i>` carries PUA text yields clean `title`/
   `description`; icon detection (fontIcon `char`) still resolves the glyph.
5. PUA-free documents produce byte-identical output everywhere (default-off invariant
   in spirit: the only observable change is removal of never-meaningful codepoints).
6. Existing suites green; API parity test passes with the updated signature.

## Coordination

html-to-pptx `feature-text-normalisation-pipeline.md` Layer 2 splits: PUA stripping
lands here; the converter keeps only its own concern (excluding icon-font elements
from counter/text *candidate selection*). The converter's loop has a task to consume
this once released.
