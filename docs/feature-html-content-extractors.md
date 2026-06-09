# Feature: HTML Content Extractors — `parseTable` / `parseTimeline` / `parseQuote` / `parseBadges` / `parseCallout` / `parseColumns`

> **Status:** Implemented
> _Shipped in `src/utils/parse-content.ts` (all six neutral extractors: `parseTable`,
> `parseColumns`, `parseTimeline`, `parseQuote`, `parseBadges`, `parseCallout`), exported from
> `src/utils.ts`, typed in `types/utils.d.ts`, tested in
> `test/feature-html-content-extractors.test.js`. The shared colour context was factored into
> `src/utils/css-context.ts`. No `Archetype`/`classifySlide` API was introduced, per the design
> principle below._
> **Target:** `@jsamuel1/pptxgenjs/utils` (next minor, after `feature-html-tree-query.md`)
> **Implements (when built):** `src/utils/parse-content.ts` (one small extractor per structure); exported from `src/utils.ts`; types in `types/utils.d.ts`; tests `test/feature-html-content-extractors.test.js`
> **Depends on:** `parseHtml`/`query`/`textOf` (`feature-html-tree-query.md`), `parseSvg` (`feature-svg-normalisation.md`); a sibling of `parseCards` (`feature-parse-card-structure.md`)
> **Priority:** Medium — reusable recognition that any HTML→PPTX converter re-implements; extends the `parseCards` precedent to the other common structures

## Problem

`parseCards()` established a clean seam: the library **recognises an HTML structure and
returns neutral data** (`CardData[]`), and the consumer decides **layout**. But card
grids are only one of several structures every HTML-deck converter has to detect. The
`html-to-pptx` converter re-implements all the others by hand over cheerio:

- `detectTable` — a real `<table>` → rows of `{ text, isHeader, color }` cells.
- `detectTimeline` — `.timeline-item`/`.timeline > *`, or repeated blocks each starting
  with a time like `7:00 AM` → `{ time, body }` rows (with nested-wrapper de-duping).
- `detectQuote` — `.quote-text`/`blockquote`, or an italic paragraph inside a
  border-left box → `{ text, attribution }`.
- `detectBadges` — `[class*="badge"|"pill"|"tag"]`, or a small rounded+bordered
  short-text element → `string[]` of pill labels.
- `detectCallout` — a bordered box that is a direct child of the slide (not the grid/
  flow/split) → its text.
- `detectColumns` — multi-column body text.

These are generic, structural, and consumer-independent — exactly the `parseCards`
profile. Pulling them into `/utils` removes duplicated recognition logic from every
converter and gives them a consistent, tested implementation.

## Design principle: represent the HTML, don't classify it into "archetypes"

This is the important constraint for these extractors (and a course-correction for the
converter's current design).

The converter today collapses each slide into one **named archetype** —
`title | divider | timeline | capGrid | quote | image | narrative | cta` — and renders
that. **"Archetype" is the wrong concept to carry upstream — and arguably the wrong
concept to keep at all.** It is:

- **Editorial, not structural.** `cta`, `divider`, `narrative` describe a slide's
  *rhetorical purpose*, which is a judgement, not a fact about the HTML. Two tools would
  not agree on them.
- **Lossy.** Forcing each slide into exactly one bucket discards real content — a slide
  that is "a heading **and** a table **and** a callout" loses two of the three.
- **A vocabulary, not a primitive.** `capGrid` is one deck style's naming; it means
  nothing in HTML or in OOXML.

So the library MUST NOT introduce any `Archetype` type, `classifySlide()`, or named
slide-kind enum. Instead, two rules:

1. **Name after the HTML structure or a real PowerPoint construct — never after a slide
   role.** `parseTable` (HTML `<table>` ↔ OOXML table), `parseTimeline` (a list of
   time-stamped rows), `parseQuote` (a quotation + attribution), `parseCards` (a grid of
   cards ↔ repeated `addCard`). Each corresponds to a concrete thing in the source HTML
   and/or a concrete PPTX construct. There is **no** `parseCapGrid`, `parseCta`, or
   `parseDivider`.
   - Litmus test: *would two different HTML→PPTX tools agree this structure is present,
     independent of how they'd render it?* If yes → library extractor. If it's a
     judgement about the slide's purpose → not a library concept (and probably shouldn't
     be a hard-coded concept in the converter either — see "Impact" below).

2. **Extract additively and faithfully, not exclusively.** Each extractor answers "is
   THIS structure present, and what is its data?" independently. A slide can yield a
   `parseQuote` result AND a `parseTable` result AND `parseBadges`. The library returns
   everything it finds; the consumer composes them. This preserves the full content of
   the HTML instead of discarding whatever didn't win a single-archetype vote.

### Layout belongs in the library; the *archetype* doesn't

Layout primitives are a good fit upstream — the library already ships `layoutGrid()`
(grid math) and the layout-bearing `addCard`/`addCallout`/`addAvatar`/`addBadge`. New
*generic, content-driven* layout helpers are welcome here too (e.g. a "stack these
recognised regions down the slide with sensible spacing" helper, or per-construct
placement for a timeline/quote/table that maps to PowerPoint). What does **not** belong
upstream is the converter's *specific* editorial composition — its exact coordinates,
theme colours, font sizes, brand-wordmark placement, and animation sequencing — and the
**archetype decision itself**. The seam is: **library = faithful structure extraction +
reusable layout primitives; consumer = the deck's specific styling and any
purpose-level decisions.** "Archetype" sits on the consumer side, if it survives at all.

## Proposed API

```ts
import {
  parseTable, parseTimeline, parseQuote, parseBadges, parseCallout, parseColumns,
} from '@jsamuel1/pptxgenjs/utils'

// All take an HTML string OR an HNode (from parseHtml), and return data or null/[].
// All are pure, synchronous, dependency-free.

parseTable(htmlOrNode, opts?): TableData | null
parseTimeline(htmlOrNode, opts?): TimelineRow[] | null
parseQuote(htmlOrNode, opts?): QuoteData | null
parseBadges(htmlOrNode, opts?): string[]
parseCallout(htmlOrNode, opts?): CalloutData | null
parseColumns(htmlOrNode, opts?): ColumnData[] | null
```

```ts
export interface TableData {
  rows: Array<Array<{ text: string; isHeader: boolean; color?: HexColor }>>
  // Designed to map straight onto slide.addTable() rows (isHeader -> bold/options).
}

export interface TimelineRow {
  /** The time/marker token, e.g. '7:00 AM' or a `.timeline-time` element's text. */
  marker: string
  /** The remaining row text. */
  body: string
}

export interface QuoteData {
  text: string            // quotation, surrounding quote glyphs stripped
  attribution?: string    // cite / .quote-attr, if any
}

export interface CalloutData {
  text: string
  accent?: HexColor       // border / border-left colour, if detectable
}

export interface ColumnData { text: string }   // one entry per detected column
```

Notes:
- `color`/`accent` reuse the same inline-style + `<style>` class-rule + `var()`
  resolution context already built for `parseCards` (`parseStyleSheets`), so colour
  handling is consistent across all extractors. Where no colour is detectable the field
  is simply omitted (never guessed).
- `parseTimeline` keeps the converter's nested-wrapper de-dup (outermost match wins) and
  the `^\d{1,2}:\d{2}\s*(AM|PM)?` marker heuristic, but returns neutral `marker`/`body`
  — it does NOT decide this is a "timeline slide."
- `parseQuote` returns the quotation as data; it does NOT decide the slide IS a quote.
- An `opts.excludeWithin?: RegExp` mirrors `parseCards` so callers can skip mockup/flow
  regions consistently.

## Question: Should this be in PptxGenJS?

**For:** every HTML→PPTX pipeline re-implements these; they're structural and
format-agnostic; `parseCards` already set the precedent and the shared parser/colour
context is reused; `parseTable`→`addTable` is a direct PPTX mapping.

**Against:** recognition heuristics (the `7:00 AM` timeline sniff, the italic-in-bordered-
box quote) are fuzzier than `parseSvg`/`parseTable` and risk false positives; the line
between "structure" and "editorial role" can blur.

**Recommended:** ship the ones with a clear structural/PPTX anchor first — **`parseTable`**
(maps to OOXML table) and **`parseColumns`** (maps to multi-column text). Add
`parseTimeline`/`parseQuote`/`parseBadges`/`parseCallout` next, each strictly as neutral
extractors per the design principle above. Keep all on the `/utils` subpath, none on the
core class. Do **not** add any archetype/`classifySlide` API — that stays a consumer
concern by design.

## Test cases

```ts
const { parseTable, parseTimeline, parseQuote, parseBadges } = require('@jsamuel1/pptxgenjs/utils')

// Table: header detection + cell colour
const t = parseTable('<table><tr><th>Name</th><th>Role</th></tr><tr><td style="color:#10B981">Ada</td><td>Eng</td></tr></table>')
assert(t.rows.length === 2 && t.rows[0][0].isHeader === true)
assert(t.rows[1][0].color === '10B981' && t.rows[1][1].isHeader === false)

// Timeline: explicit class
const tl = parseTimeline('<div class="timeline"><div class="timeline-item"><span class="time">7:00 AM</span> Standup</div><div class="timeline-item"><span class="time">9:00 AM</span> Build</div></div>')
assert(tl.length === 2 && tl[0].marker === '7:00 AM' && /Standup/.test(tl[0].body))

// Timeline: heuristic + nested-wrapper de-dup (one entry wrapped 3 deep counts once)
const tl2 = parseTimeline('<div><div><div>7:00 AM Wake</div></div><div><div>8:00 AM Run</div></div></div>')
assert(tl2.length === 2)

// Quote: blockquote + cite
const q = parseQuote('<blockquote>"Ship it"<cite>Grace</cite></blockquote>')
assert(q.text === 'Ship it' && q.attribution === 'Grace')

// Composability: a slide yields BOTH a quote and a table (no single-archetype collapse)
const html = '<section><blockquote>"Hi"</blockquote><table><tr><td>x</td></tr></table></section>'
assert(parseQuote(html) && parseTable(html))

// Badges
assert(parseBadges('<span class="badge">NEW</span><span class="pill">BETA</span>').length === 2)

// No false archetype: plain prose yields nothing from the structured extractors
assert(parseTimeline('<p>just text</p>') === null && parseTable('<p>just text</p>') === null)
```

## Implementation location

- `src/utils/parse-content.ts` — the extractors; reuse `parseHtml`/`query`/`textOf`
  (`html-dom.ts`) and the `parseStyleSheets` colour context from `parse-cards.ts`
  (factor that context into a shared `css-context.ts` so `parseCards` and the new
  extractors share one implementation).
- `src/utils.ts` — re-export the extractors + their types.
- `types/utils.d.ts` — `TableData`, `TimelineRow`, `QuoteData`, `CalloutData`,
  `ColumnData` + signatures.
- `test/feature-html-content-extractors.test.js`.

## Impact on the `html-to-pptx` converter

`detectTable`, `detectTimeline`, `detectQuote`, `detectBadges`, `detectCallout`,
`detectColumns` (and their colour/dedup helpers) become thin calls to the library
extractors. Beyond that, this is the moment to **retire the `archetype` concept** in the
converter rather than preserve it:

- **Drop the single-archetype `classify()`.** Instead of choosing ONE of
  `title|divider|capGrid|…` per slide, render **every** structure the composable
  extractors report (a heading + a table + a callout all appear), placing each with the
  library's layout primitives. This makes the converter faithfully *represent the HTML*
  instead of bucketing it. Any remaining named handling should exist only where it maps
  to a genuine PowerPoint intent (e.g. an actual title/section layout), not as an
  editorial taxonomy.
- **Layout can move upstream too.** Generic placement (grid math via `layoutGrid`, and
  any new "stack recognised regions" / per-construct placement helper) belongs in the
  library; only the converter's *specific* coordinates, theme colours, fonts, and
  animation sequencing stay local.
- `detectFramework`/`selectSlides` — converter-specific input-framework knowledge — stay
  in the converter.

This keeps faithful structure recognition **and** reusable layout in the library, and
leaves only the deck's specific styling (and any purpose-level decisions, if kept at
all) in the converter. The `archetype` enum is not something the library should adopt.
