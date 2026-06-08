# Feature: Generic Card Structure Parser — `parseCards()`

> **Status:** Implemented (v4.1.7)
> **Target:** `@jsamuel1/pptxgenjs/utils`
> **Implemented in:** `src/utils/parse-cards.ts`; exported from `src/utils.ts`; types `types/utils.d.ts` (`CardData`, `ParseCardsOptions`); tests `test/feature-parse-cards.test.js`
> **Depends on:** `parseSvg()` (see `feature-svg-normalisation.md`)
> **Priority:** High — turns the converter's grid handling into a 3-line call

> **Implementation notes (shipped):**
> - **Dependency-free.** Parsing uses a small built-in stack-based HTML tree-builder — NOT cheerio
>   — to preserve the library's zero-runtime-dependency guarantee (consistent with `parseSvg()` and
>   `extractThemeFromCSS()`). An inline `<svg>` subtree is captured raw and handed to `parseSvg()`.
> - **Default class patterns** are tested per class token with a `(?:^|-)` prefix, so a bare `card`/
>   `grid` matches as well as `feature-card`/`cap-grid`: `cardPattern` `/(?:^|-)(card|item|tile|cell)\b/`,
>   `containerPattern` `/(?:^|-)grid\b/`.
> - **Colour scope:** colours are read from INLINE `style="…"` attributes only in this release. The
>   deeper CSS cascade (class rules, `var()` against `:root`, browser computed styles) described below
>   is a documented limitation tracked as a converter-gaps follow-up — it is not silently dropped.
> - A live DOM `Node` input is not handled in this release (string input only).

## Problem

Every HTML-to-deck converter re-implements "find the card grid, then read each
card's icon / title / description / badge / colours." Doing this robustly is
non-trivial because:

- Frameworks name things differently (`cap-item`, `wf-card`, `skill-card`,
  `feature-tile`, `pricing-card`, …). Hardcoding class names is brittle.
- Card internals vary: the icon may be an inline `<svg>`, an `<i class="fa-*">`
  glyph, or an emoji; the title may be a heading, a `*-title` element, or just the
  first bold line; colours live in inline styles, CSS classes, or computed styles.
- Mis-detection silently drops content or mislabels a timeline/flow as a grid.

This belongs in the library as a **structure-driven, pattern-based** parser so any
consumer gets the same correct result.

## Proposed API

```ts
import { parseCards } from '@jsamuel1/pptxgenjs/utils'

const cards: CardData[] = parseCards(htmlOrNode, {
  containerPattern?: RegExp,   // default: /-grid\b/ OR display:grid / grid-template-columns / flex(>=3 children)
  cardPattern?: RegExp,        // default: /-(card|item|tile|cell)\b/
  excludeWithin?: RegExp,      // default: /-(anim-right)|product-anim|flow|feed-item/ (skip mockup/flow visuals)
  defaultFill?: string,        // fallback card fill
})

interface CardData {
  icon?:
    | { type: 'svg', parts: SvgPart[] }                 // from parseSvg() — multi-path, per-path fills
    | { type: 'fontIcon', char: string, fontFace: string }
    | { type: 'emoji', text: string }
  title: string
  description?: string
  badge?: { text: string, color: HexColor }
  accentBar?: { color: HexColor | GradientFillProps, width: number }
  colors: {
    iconColor?: HexColor
    tileFill?: HexColor | GradientFillProps
    cardFill?: HexColor | GradientFillProps
    borderColor?: HexColor
    titleColor?: HexColor
    descColor?: HexColor
  }
  _el?: unknown   // (Node builds) back-reference to the source element, for advanced callers
}
```

## Detection algorithm (framework-agnostic)

1. **Cards by pattern** — collect elements whose class token matches `cardPattern`
   (`/-(card|item|tile|cell)\b/`), excluding any inside an `excludeWithin` region;
   keep only outermost matches (a card nested in a card is not its own cell).
   If ≥2 found, those are the cards.
2. **Else container by pattern** — find an element matching `containerPattern`
   (`*-grid` class, or CSS `display:grid`/`grid-template-columns`/`display:flex`
   with ≥3 children) and use its repeated children as cards.
3. **Per-card structure analysis** (NOT class-name driven):
   - **icon**: first inline `<svg>` → `parseSvg()` parts; else first
     `<i class="fa-*">`/`<span class="fa-*">` → `{ fontIcon }` (and, if a vector
     path map is available, prefer `{ type:'svg', parts }`); else a leading emoji
     character → `{ emoji }`.
   - **title**: a descendant whose class matches `/-(title|name|heading|head|label)\b/`,
     else the first `h1..h4`/`strong`/`b`, else the first short text child.
   - **description**: a descendant matching `/-(desc|text|body|caption|subtitle|sub|detail|blurb)\b/`,
     else the second text child.
   - **badge**: a small pill/circle (class `/-(badge|pill|tag|count|chip)\b/`, or a
     styled element with `border-radius` + `background` + ≤12-char text).
   - **accentBar**: a thin (≤6px) full-height left-edge child or a `border-left` rule.
4. **Colour extraction** — read inline styles first, then CSS-class rules, then
   computed styles (browser builds). Low-alpha `rgba()` surfaces are blended toward
   the deck background for tiles/fills; border hues are preserved at full saturation.
   `var()` references are resolved against `:root`.

## Usage (the entire grid renderer)

```ts
import { parseCards } from '@jsamuel1/pptxgenjs/utils'

const cards = parseCards(slideHtml)
const grid = pptx.layoutGrid({ items: cards.length, columns: 3, area, gap: 0.2 })
cards.forEach((card, i) => slide.addCard({ ...grid[i], ...card }))
```

The `CardData` shape is designed to spread **directly** into `addCard()` v2 props
(see `feature-addcard-v2.md`): `icon`, `title`, `description`, `badge`, `accentBar`,
and the `colors.*` map onto `iconColor`/`iconFill`/`fill`/`border`/`titleFont.color`/
`descFont.color`.

## Implementation location

- `src/utils/parse-cards.ts` — pure analysis, no OOXML emission; calls `parseSvg()`
- Re-export from `src/utils.ts`
- `types/utils.d.ts` — `CardData`, `ParseCardsOptions`
- Node builds use cheerio for parsing; a browser build can accept a live DOM node

## Test cases

```ts
// Pattern detection across naming conventions
const a = parseCards('<div class="cap-grid"><div class="cap-item"><div class="cap-title">A</div><div class="cap-desc">x</div></div><div class="cap-item"><div class="cap-title">B</div></div></div>')
assert(a.length === 2 && a[0].title === 'A' && a[0].description === 'x')

const b = parseCards('<div class="workflow-grid"><div class="wf-card"><div class="wf-title">One</div></div><div class="wf-card"><div class="wf-title">Two</div></div></div>')
assert(b.length === 2 && b[0].title === 'One')   // different framework naming, same result

// Icon typing
const fa = parseCards('<div class="grid"><div class="card"><i class="fas fa-users"></i><div class="title">Team</div></div><div class="card"><i class="fas fa-code"></i><b>Build</b></div></div>')
assert(fa[0].icon.type === 'fontIcon' || fa[0].icon.type === 'svg')

// Structure-driven (no semantic classes): first text = title, second = desc
const inl = parseCards('<div style="display:grid"><div style="background:#1a1a24"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>Knowledge Graph</div><div>Memory</div></div><div style="background:#1a1a24"><div>Agents</div></div></div>')
assert(inl[0].title === 'Knowledge Graph' && inl[0].description === 'Memory' && inl[0].icon.type === 'svg')

// Badge + colour extraction
const bdg = parseCards('<div class="grid"><div class="card" style="background:#1a1a24;border:1px solid #2A2438"><span class="badge" style="background:#10B981">NEW</span><div class="title">X</div></div><div class="card"><div class="title">Y</div></div></div>')
assert(bdg[0].badge.text === 'NEW' && bdg[0].colors.borderColor === '2A2438')
```

## Impact on converter

Replaces the converter's `detectGrid`, `gridCellEls`, and `gridCells` (and their
colour/badge/icon-wrapper extraction) — **~120 lines** — with a single
`parseCards()` call. Combined with `parseSvg()`, `layoutGrid()`, and `addCard()` v2,
the entire `renderCapGrid()` collapses to the 3-line usage above.
