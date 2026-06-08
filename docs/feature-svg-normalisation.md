# Feature: SVG Normalisation Utility — `parseSvg()`

> **Status:** Proposed
> **Target:** `@jsamuel1/pptxgenjs/utils` (next minor)
> **Implements (when built):** `src/utils/parse-svg.ts`; exported from `src/utils.ts` (`/utils` subpath); types `types/utils.d.ts` (`SvgPart`, `ParseSvgOptions`); tests `test/feature-parse-svg.test.js`
> **Priority:** High — removes the single largest block of custom rendering code from every SVG-aware converter

## Problem

PptxGenJS' custom-geometry engine (`svgPath`) only understands the path commands
`M`/`L`/`H`/`V`/`C`/`Q`/`Z`. It has **no** arc (`A`) or smooth-curve (`S`/`T`)
support and silently emits garbage points when it meets one. Real-world icon sets
(Lucide/Feather, Font Awesome, brand logos) rely heavily on arcs, primitive shapes
(`circle`/`rect`/…), and per-path gradient fills.

As a result every converter that wants to render inline `<svg>` faithfully must
re-implement a sizeable SVG pipeline. In the `html-to-pptx` skill this is ~200
lines across five functions:

- `tokenizeSvgPath()` — lex a `d` string into command/argument segments
- `arcToCubics()` — convert elliptical arcs (`A`) to ≤4 cubic béziers
- `normalizeSvgPath()` — fold `H`/`V`→`L`, `S`/`T`→`C`/`Q`, relative→absolute, `A`→`C`
- `primitiveToPath()` — `circle`/`ellipse`/`rect`/`line`/`polyline`/`polygon` → path `d`
- `svgToParts()` — walk the `<svg>`, group by paint, resolve `<linearGradient>` refs

This logic is generic, has nothing to do with the source HTML framework, and
belongs in the library so every consumer benefits and the correctness is tested
in one place.

## Proposed API

```ts
import { parseSvg } from '@jsamuel1/pptxgenjs/utils'

const parts: SvgPart[] = parseSvg(svgMarkup, {
  viewBox?: { w: number, h: number },   // override; else read from the <svg viewBox>
  defaultFill?: string,                  // fallback when an element has no resolvable paint
})

interface SvgPart {
  d: string                              // normalised path (M/L/C/Q/Z only, absolute)
  viewBox: { w: number, h: number }
  fill: HexColor | GradientFillProps     // solid hex OR a PptxGenJS gradient fill
  stroke?: HexColor
  strokeWidth?: number                   // in viewBox units
  opacity?: number                       // 0–1 (from fill-opacity / opacity)
  mode: 'fill' | 'stroke'                // how the element was painted in the source
}
```

### Usage (the only converter code that remains)

```ts
import { parseSvg } from '@jsamuel1/pptxgenjs/utils'

const parts = parseSvg(svgMarkup, { defaultFill: '7C3AED' })
parts.forEach(part => {
  slide.addShape('custGeom', {
    x, y, w, h,
    svgPath: { d: part.d, viewBox: part.viewBox },
    fill: part.mode === 'stroke' ? { type: 'none' } : part.fill,
    line: part.mode === 'stroke' ? { color: part.stroke, width: part.strokeWidth } : { type: 'none' },
  })
})
```

## Behaviour

1. **Accepts** a raw SVG string (or a pre-parsed cheerio/DOM node). String input is
   parsed with a dependency-free HTML/XML reader (cheerio is acceptable since it is
   already a peer in Node usage; no browser DOM required).
2. **Primitives → path** — `circle`/`ellipse` become 4-cubic approximations,
   `rect` (incl. `rx`/`ry` rounded corners) becomes line+cubic corners, `line`/
   `polyline`/`polygon` become `M`/`L`(+`Z`).
3. **Command normalisation** — every command is reduced to absolute `M`/`L`/`C`/`Q`/`Z`:
   - `H`/`V` → `L`
   - `S`/`T` → `C`/`Q` (reflect the previous control point)
   - `A` (elliptical arc) → ≤4 cubic béziers (endpoint→centre parameterisation)
   - relative (lowercase) → absolute, tracked against the current pen position
4. **Gradient resolution** — a `fill="url(#id)"` (or `stroke="url(#id)"`) is looked
   up against `<linearGradient>`/`<radialGradient>` definitions in the same SVG and
   returned as a `GradientFillProps` (`{ type: 'gradient', direction, stops }`).
   Gradient `stop-color`/`offset` and the `x1/y1/x2/y2` vector → direction are parsed.
   **Note:** match gradients by `id` attribute, not tag selector — HTML-mode parsers
   lowercase camelCase SVG tag names (`linearGradient` → `lineargradient`), so a tag
   selector silently misses them.
5. **Per-path paint preserved** — elements are grouped by `(mode, colour|gradient,
   strokeWidth)`; each group becomes one `SvgPart`. A multi-colour logo therefore
   yields multiple parts and is **not** flattened to a single tint.
6. **Inheritance** — `stroke`/`fill`/`stroke-width` set on the root `<svg>` are
   inherited by children that don't set their own; `currentColor`/`none` are honoured.

## Implementation location

- `src/utils/parse-svg.ts` — pure, dependency-light; no OOXML emission
- Re-export `parseSvg` from `src/utils.ts` (the existing `/utils` subpath that already
  exports `extractThemeFromCSS`)
- `types/utils.d.ts` — add `SvgPart`, `ParseSvgOptions`, and the `parseSvg` signature
- Reuse the `GradientFillProps` shape from the core types so output drops straight
  into `addShape({ fill })`

## Test cases

```ts
// Arc expansion: a circle primitive yields a closed 4-cubic path, no 'A' remaining
const c = parseSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>')
assert(c.length === 1 && /^M/.test(c[0].d) && !/[Aa]/.test(c[0].d))

// Multi-colour preservation: two paths with different fills → two parts
const m = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0L8 0" fill="#FF0000"/><path d="M0 8L8 8" fill="#00FF00"/></svg>')
assert(m.length === 2 && m[0].fill === 'FF0000' && m[1].fill === '00FF00')

// Gradient resolution: fill="url(#g)" → GradientFillProps with the stop colours
const g = parseSvg('<svg viewBox="0 0 24 24"><path d="M0 0L24 24" fill="url(#g)"/><defs><linearGradient id="g" x1="0" y1="0" x2="24" y2="24"><stop stop-color="#FF4B14"/><stop offset="1" stop-color="#6842FF"/></linearGradient></defs></svg>')
assert(g[0].fill.type === 'gradient' && g[0].fill.stops.length === 2)

// Stroke icon: stroke="#A78BFA" fill="none" → mode 'stroke', stroke colour preserved
const s = parseSvg('<svg viewBox="0 0 24 24" fill="none" stroke="#A78BFA" stroke-width="1.5"><path d="M3 12h18"/></svg>')
assert(s[0].mode === 'stroke' && s[0].stroke === 'A78BFA' && s[0].strokeWidth === 1.5)
```

## Impact on converter

Deletes `tokenizeSvgPath`, `arcToCubics`, `normalizeSvgPath`, `primitiveToPath`,
`svgToParts`, `svgToPath`, `resolveSvgPaint`, `svgGradient`, and the `drawSvgParts`
helper's SVG-specific bits — **~200 lines** — replacing them with a single
`parseSvg()` call. The converter keeps only the thin "place each part as a
`custGeom`" loop shown above.
