# Feature: Pattern Fill on Shapes (`a:pattFill`)

> **Status:** Proposed
> **Priority:** High — Phase 1 (matrix `⚠️ Partial` → `✅`); shape fills currently only support `none`/`solid`/`gradient`
> **Matrix row:** §3 Fills — "Pattern fill"

## Problem

`ShapeFillProps.type` accepts only `'none' | 'solid'` (plus the separate
`GradientFillProps`). OOXML supports preset hatch/pattern fills via
`<a:pattFill>`, which the library cannot author. Decks needing hatched fills
(charts-as-shapes, legends, accent textures) can't be produced.

## Proposed API

```ts
slide.addShape('rect', {
  x: 1, y: 1, w: 4, h: 2,
  fill: {
    type: 'pattern',
    preset: 'ltUpDiag',   // ST_PresetPatternVal (e.g. pct5, dkHorz, ltUpDiag, cross, ...)
    foreColor: '7C3AED',  // hex or theme color
    backColor: '1a1a24',  // hex or theme color (default: transparent/white)
  },
})
```

## What it generates (OOXML)

```xml
<a:pattFill prst="ltUpDiag">
  <a:fgClr><a:srgbClr val="7C3AED"/></a:fgClr>
  <a:bgClr><a:srgbClr val="1A1A24"/></a:bgClr>
</a:pattFill>
```

- `prst` is one of the ECMA-376 `ST_PresetPatternVal` values (54 presets).
- Validate `preset` against the enum; reject/clamp unknown values with a warn.

## Implementation location

- `src/core-interfaces.ts` — extend `ShapeFillProps` with a `'pattern'` variant
  (`PatternFillProps { type:'pattern'; preset: PresetPattern; foreColor: Color; backColor?: Color }`)
  and add a `PresetPattern` string-literal union.
- `src/core-enums.ts` — `ST_PresetPatternVal` value list.
- `src/gen-xml.ts` / `src/gen-utils.ts` — fill emitter: branch on
  `fill.type === 'pattern'` and emit `<a:pattFill>`.

## Edge cases

- Missing `backColor` → omit `<a:bgClr>` (PowerPoint treats as no background).
- Theme colors (`ACCENT1`...) resolve through the existing color selector.
- Default-off: shapes without a pattern fill emit byte-identical XML.

## Test cases

```ts
// pattern fill emits <a:pattFill prst="..."> with fg/bg
const xml = await slide1Xml(s => s.addShape('rect', { x:1,y:1,w:2,h:1,
  fill: { type:'pattern', preset:'ltUpDiag', foreColor:'7C3AED', backColor:'1A1A24' } }))
assert(xml.includes('<a:pattFill prst="ltUpDiag">'))
assert(xml.includes('<a:fgClr><a:srgbClr val="7C3AED"/>'))
// schema fixture: chart-shape-patternfill validates clean
```

## Acceptance

- New schema fixture in `test/schema.test.js` validates clean for ≥3 presets.
- `docs/FEATURE-MATRIX.md` "Pattern fill" row → `✅ Done`.
- `website/docs/api-shapes.md` documents the `pattern` fill with an example.
- `CHANGELOG.md` `Added` entry.
