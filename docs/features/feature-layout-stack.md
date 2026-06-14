# Feature: Vertical Stack / Region-Flow Layout — `layoutStack()`

> **Status:** Implemented (v4.3.1)
> **Implemented:** `layoutStack` in `src/gen-utils.ts` (sibling to `layoutGrid`), instance method re-exported via `src/pptxgen.ts`; types `LayoutStackBlock`/`LayoutStackProps`/`LayoutStackCell`/`LayoutStackResult` in `src/core-interfaces.ts` + `types/index.d.ts`; tests `test/feature-layout-stack.test.js`
> **Target:** `@jsamuel1/pptxgenjs/utils` (next minor) — or core, alongside `layoutGrid()`
> **Depends on:** nothing — pure box arithmetic, reuses `LayoutGridArea`/`LayoutGridCell`
> **Priority:** Medium — the layout primitive an HTML→PPTX converter needs to COMPOSE several recognised structures down a slide without re-hand-rolling y-cursor math

## Problem

`layoutGrid()` solves 2-D grid placement (N equal cells in C columns). But the other half of
slide layout — **stacking a few variable-height blocks down a region** (a heading, then a table,
then a callout; or a title + subtitle + body) — has no primitive. Every consumer re-implements the
same vertical-cursor arithmetic:

```js
let y = 0.85
addHeading(...); y += 0.85
addTable(...);   y += tableH + 0.2
addCallout(...); y += ...
```

This is error-prone (manual gap bookkeeping, overflow past the slide edge, no way to distribute or
centre leftover space) and it is exactly the math that becomes load-bearing once a converter stops
choosing ONE archetype per slide and instead **composes** the structures it found (see the
`html-to-pptx` converter's `docs/features/feature-format-coupling-inventory.md` §C — the move away from a
single-archetype `classify` toward rendering every recognised block).

This belongs upstream as a **generic, content-agnostic layout primitive**, the vertical companion
to `layoutGrid()`.

## Scope (explicitly generic — no archetype, no styling)

This is **layout math only**: given a region and a list of block heights, return a `{ x, y, w, h }`
box per block. It has **no** knowledge of what a block *is* (heading/table/quote), no theme, no
fonts, no colours, and emits no OOXML. It mirrors `layoutGrid()`'s contract: pure function in
`gen-utils`, returns boxes the caller fills with `addText`/`addTable`/`addCard`/etc.

It deliberately introduces **no "archetype"/slide-kind concept** — consistent with the library's
content-extractor design (`feature-html-content-extractors.md`). Naming a *region role* is the
caller's business; this primitive only places boxes.

## Proposed API

```ts
import { layoutStack } from '@jsamuel1/pptxgenjs/utils'   // also pptx.layoutStack(...)

const boxes = layoutStack({
  area: { x: 0.7, y: 0.85, w: 12, h: 6 },   // bounding box (inches) — reuses LayoutGridArea
  blocks: [
    { height: 0.7 },                         // fixed-height block (e.g. a heading)
    { height: 2.4, minHeight: 1.0 },         // a table; may shrink to minHeight if space is tight
    { flex: 1 },                             // takes the remaining space (e.g. body)
    { height: 0.5 },                         // a footer callout
  ],
  gap: 0.2,                                  // vertical gap between blocks (inches)
  align: 'start',                            // distribute leftover space: start|center|end|between|stretch
  overflow: 'shrink',                        // when blocks exceed area height: shrink|clip|grow
})
// boxes: LayoutStackResult — one { x, y, w, h } per block, in order, full-width within area.
```

```ts
/** One block to place in the stack. Exactly one of `height` or `flex` is the sizing driver. */
export interface LayoutStackBlock {
  /** Fixed block height (inches). Omit when using `flex`. */
  height?: number
  /** Flexible weight — shares leftover space with other `flex` blocks (proportional). Omit when fixed. */
  flex?: number
  /** Lower bound (inches) a fixed block may be shrunk to under `overflow:'shrink'`. @default `height` */
  minHeight?: number
  /** Per-block width inset (inches) from the area width (e.g. an indented callout). @default 0 */
  inset?: number
}

export interface LayoutStackProps {
  /** Bounding box (inches) to lay the stack out within. (Reuses `LayoutGridArea`.) */
  area: LayoutGridArea
  /** Blocks to stack top→bottom, in order. */
  blocks: LayoutStackBlock[]
  /** Vertical gap between adjacent blocks (inches). @default 0.2 */
  gap?: number
  /**
   * How to distribute leftover vertical space when fixed blocks under-fill the area
   * (ignored once any `flex` block is present — flex consumes the slack):
   *  - 'start'   : pack at the top (leftover at the bottom)               [default]
   *  - 'center'  : centre the packed stack vertically
   *  - 'end'     : pack at the bottom
   *  - 'between' : equal gaps between blocks, flush top and bottom
   *  - 'stretch' : grow each fixed block proportionally to fill the area
   */
  align?: 'start' | 'center' | 'end' | 'between' | 'stretch'
  /**
   * When the blocks (+gaps) exceed the area height:
   *  - 'shrink' : reduce fixed blocks toward their `minHeight` proportionally to fit   [default]
   *  - 'clip'   : keep natural heights; later boxes may extend past the area (caller's problem)
   *  - 'grow'   : keep natural heights and report the overflow via the result's `overflow` flag
   */
  overflow?: 'shrink' | 'clip' | 'grow'
}

/** One positioned block (inches), in input order. Same shape as `LayoutGridCell`. */
export interface LayoutStackCell { x: number, y: number, w: number, h: number }

/** Result of `layoutStack()`. Carries an `overflow` flag for the `overflow:'grow'` case. */
export type LayoutStackResult = LayoutStackCell[] & { overflow?: boolean }
```

## Behaviour

1. **Fixed + flex sizing.** Sum the fixed `height`s and the `(blocks-1) * gap`. Any leftover area
   height is divided among `flex` blocks in proportion to their weights. A block with neither
   `height` nor `flex` is treated as `flex: 1`.
2. **`align` (no flex present).** Distributes the leftover (`start`/`center`/`end`/`between`) or
   removes it (`stretch` grows fixed blocks proportionally). With any `flex` block, `align` is a
   no-op (flex already absorbed the slack).
3. **`overflow` (content too tall).** `shrink` reduces fixed blocks toward `minHeight`
   proportionally until it fits (flex blocks floor at 0); `clip` leaves natural heights (boxes may
   exceed `area`); `grow` leaves natural heights and sets `result.overflow = true` so the caller can
   react (e.g. push content to a new slide).
4. **Width.** Every box is `area.w - 2*inset` wide, positioned at `area.x + inset`. Full-width by
   default; `inset` indents a block.
5. **Determinism + guards.** Pure and side-effect-free. Empty `blocks` → `[]`. Non-positive
   `area.w/h` throws (matches `layoutGrid`). Never throws for a single overflowing block — that is
   what `overflow` is for.

## Usage — composing recognised structures (the converter's case)

```ts
import { layoutStack, parseTable, parseQuote, parseCallout } from '@jsamuel1/pptxgenjs/utils'

const present = []
const heading = getHeadingRuns(slideHtml);          if (heading)            present.push({ kind: 'heading', height: 0.8, data: heading })
const table   = parseTable(slideHtml);               if (table)              present.push({ kind: 'table', flex: 2, data: table })
const callout = parseCallout(slideHtml);             if (callout)            present.push({ kind: 'callout', height: 0.6, data: callout })

const boxes = layoutStack({ area: { x: 0.7, y: 0.85, w: 12, h: 6 }, blocks: present, gap: 0.2 })
present.forEach((b, i) => renderBlock(slide, b, boxes[i]))   // caller owns styling per kind
```

The converter places **everything it recognised**, in document order, with no single-archetype
decision and no bespoke y-cursor — `layoutStack` owns the arithmetic; the converter owns the
look. `layoutGrid` (within a cell) and `layoutStack` (down a region) compose: a `flex` block can be
subdivided with `layoutGrid` for a card grid.

## Implementation location

- `src/gen-utils.ts` — `export function layoutStack (props: LayoutStackProps): LayoutStackResult`,
  immediately after `layoutGrid`. Pure arithmetic; reuse `LayoutGridArea`.
- `src/pptxgen.ts` — re-export as an instance method `pptx.layoutStack(...)` (as `layoutGrid` is).
- `src/core-interfaces.ts` + `types/index.d.ts` — `LayoutStackBlock`/`LayoutStackProps`/
  `LayoutStackCell`/`LayoutStackResult`.
- `src/utils.ts` — also export from `/utils` for the string-input converter path.

## Test cases

```ts
const { layoutStack } = require('@jsamuel1/pptxgenjs/utils')
const A = { x: 1, y: 1, w: 10, h: 6 }

// fixed blocks pack from the top with gaps
const a = layoutStack({ area: A, blocks: [{ height: 1 }, { height: 2 }], gap: 0.5 })
assert(a[0].y === 1 && a[0].h === 1 && a[1].y === 2.5 && a[1].h === 2 && a[0].w === 10)

// flex absorbs leftover: fixed 1 + gap 0.5 leaves 4.5 for the flex block
const b = layoutStack({ area: A, blocks: [{ height: 1 }, { flex: 1 }], gap: 0.5 })
assert(b[1].h === 4.5 && b[1].y === 2.5)

// two flex blocks split leftover by weight (1:2)
const c = layoutStack({ area: A, blocks: [{ flex: 1 }, { flex: 2 }], gap: 0 })
assert(Math.abs(c[0].h - 2) < 1e-9 && Math.abs(c[1].h - 4) < 1e-9)

// align:center centres an under-filling fixed stack
const d = layoutStack({ area: A, blocks: [{ height: 1 }, { height: 1 }], gap: 0, align: 'center' })
assert(Math.abs(d[0].y - (1 + (6 - 2) / 2)) < 1e-9)

// overflow:'shrink' fits oversized fixed blocks toward minHeight
const e = layoutStack({ area: { ...A, h: 2 }, blocks: [{ height: 3, minHeight: 0.5 }, { height: 3, minHeight: 0.5 }], gap: 0, overflow: 'shrink' })
assert(e[0].h + e[1].h <= 2 + 1e-9 && e[0].h >= 0.5)

// overflow:'grow' flags but does not resize
const f = layoutStack({ area: { ...A, h: 2 }, blocks: [{ height: 3 }], overflow: 'grow' })
assert(f.overflow === true && f[0].h === 3)

// inset indents + narrows a block
const g = layoutStack({ area: A, blocks: [{ height: 1, inset: 0.5 }] })
assert(g[0].x === 1.5 && g[0].w === 9)

// guards: empty -> []; bad area throws
assert(layoutStack({ area: A, blocks: [] }).length === 0)
let threw = false; try { layoutStack({ area: { x: 0, y: 0, w: 0, h: 0 }, blocks: [{ height: 1 }] }) } catch (_) { threw = true }
assert(threw)
```

## Impact on the `html-to-pptx` converter

Enables the §C direction in `docs/features/feature-format-coupling-inventory.md`: replace the
single-archetype `classify` + per-archetype `render*` y-cursor code with "recognise every structure
(`parseTable`/`parseTimeline`/`parseQuote`/`parseBadges`/`parseCallout`/`parseCards`) → `layoutStack`
the present ones → render each in its box." The converter keeps its styling/theme/animation and its
*input-format* knowledge; the vertical layout math moves upstream next to `layoutGrid`.
