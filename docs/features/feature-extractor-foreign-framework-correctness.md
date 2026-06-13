# Feature: Extractor correctness on foreign frameworks

> **Status:** Implemented
> **Priority:** High — silently-wrong output on Bootstrap/Tailwind/MUI, the top
> real-world inputs. Source: overfitting audit 2026-06-13, all items
> execution-verified (harness preserved at test/fixtures/foreign/_roast-harness.js).

## Problem (each verified by running the built public entry)

1. **DESC_PAT token collisions corrupt descriptions on the top-2 frameworks**
   (parse-cards.ts:109, 274, 278): Bootstrap `card-body` matches `body` → description
   = entire card dump incl. badge text (the skip-set from :255-261 is ignored by
   `textOf(descEl)`); Tailwind `text-lg` on the heading matches `text` → description
   === title, real description silently discarded.
2. **MUI scramble**: `MuiChip-label` matches TITLE_PAT (`label`) → card title = chip
   text; real `h5` title lost because the heading fallback (parse-cards.ts:268) stops
   at `h[1-4]`; `parseBadges` misses `MuiChip` while parseCards' own BADGE_PAT has
   `chip` — two badge vocabularies in one library.
3. **parseBadges unanchored** (parse-content.ts:312): `/badge|pill|tag/i` substring →
   "vintage/caterpillar/heritage" are badges. parse-cards got anchored patterns;
   parse-content didn't.
4. **parseQuote loses attribution in the WHATWG-canonical pattern**
   (parse-content.ts:287-290): `figure > blockquote + figcaption` — figcaption is a
   sibling, never searched; `<q>` unsupported; CJK 「」『』 not in stripQuoteGlyphs;
   `<footer>` attribution unrecognised.
5. **parseTimeline** (parse-content.ts:201, 243-272): time = `/^\d{1,2}:\d{2}(AM|PM)?/`
   only (no `<time datetime>`, no locale forms); container-swallow bug DUPLICATES rows
   (outermost-element heuristic keeps the container whose concatenated text also
   starts with the first time token); block bodies concatenated without separators.
6. **parseTable ignores colspan** (parse-content.ts:28-35, 98-105): header `colspan=2`
   → 3 header cells over 4-cell rows; every column right of a span shifts under the
   wrong header.
7. **parseColumns detects neither flexbox nor Bootstrap cols** (parse-content.ts:
   115-131): only anchored `col` classes + `column-count`; `flexInfoOf` sits unused.
8. **Pattern options not exposed**: TITLE/DESC/BADGE/NEVER_ADOPT patterns and the
   60-char title-likeness / 24-char badge caps (parse-cards.ts:108-110, 255, 336, 378)
   are hardwired English/Latin morphology — a `.titel`/`.card__name` framework can
   override cardPattern but not what counts as a title; CJK length caps wrong.
9. **Icon layer**: card icon gate is FA-only (`isFaClass`, parse-cards.ts:141-143,
   228, 339) despite `detectIcon` supporting fa/bi/ph/ion/material; `fontFaceFor`
   resolves every non-FA family to `'Font Awesome 6 Free'` (:150-157) — garbage
   glyphs by design. `resolveIconFonts`: `useCdn` defaults TRUE with unpinned
   `6.x`/jsdelivr/unpkg URLs (resolve-icon-fonts.ts:37, 89-92, 171).
10. **tokenizeCode `lang` param is dead** (tokenize-code.ts:46) — accepted, ignored,
    every language gets JS keywords.
11. **list-group titles empty**: `textBlocks` (parse-cards.ts:210) iterates element
    children only — an `<li>`'s direct text node is unreachable.

## Proposal

Fix in slices, test-first, each slice adding its foreign-framework fixture under
`test/fixtures/foreign/` (byte-faithful Bootstrap 5 / Tailwind UI / MUI snippets — the
audit harness documents the exact failing inputs): (1) title/desc resolution — skip
title subtree + badge skip-set when extracting description, heading fallback through
h6, prefer headings over TITLE_PAT class hits, direct-text-node support; (2) anchor
parseBadges + add `chip`, share one badge pattern; (3) parseQuote: figure/figcaption +
footer + q + unicode quote-glyph table; (4) parseTimeline: `<time datetime>` first,
locale-tolerant fallback, fix container-swallow (prefer innermost time-led elements),
separator-joined bodies; (5) parseTable colspan (emit spans or pad cells — pick one,
document); (6) parseColumns: flex path via existing flexInfoOf + optional col-class
opt-in; (7) expose `titlePattern/descPattern/badgePattern/neverAdopt/titleMaxChars`
options; (8) icon gate via detectIcon + family→face registry + `useCdn:false` +
pinned CDN versions; (9) tokenizeCode: honour `lang` minimally (keyword sets for the
KNOWN list) or remove the param (breaking is fine).

## Acceptance criteria

Executed against the committed foreign fixtures: Bootstrap card → title "Fast Setup",
description = body text ONLY, badge "New"; Tailwind card → real description; MUI →
h5 title, chip as badge; WHATWG figure quote → attribution "William Gibson"; `<ol>` +
`<time>` timeline → 2 rows, zero duplicates, German rows not duplicated; colspan table
→ aligned columns; flex two-column → 2 columns. No network in any test run. Parity
green; options documented in typings.
