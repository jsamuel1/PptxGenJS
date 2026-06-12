# Feature: Gradient Text Glyph Fills

> **Status:** Implemented (v4.1.7) — shipped via the `color` property, **not** `fill` (see "Implemented via `color`" below)
> **Target:** `src/gen-xml.ts` (`genXmlTextRunProperties`), `src/core-interfaces.ts` (`TextPropsOptions.color`), tests `test/feature-text-gradient.test.js`
> **Priority:** Medium — common hero/title treatment; current `fill` on text fills the BOX, not the glyphs

## Implemented via `color` (not `fill`)

Glyph gradients ship through the **`color`** property — `addText(text, { color: GradientFillProps })`
— rather than the `fill` property this proposal originally suggested:

```ts
slide.addText('How Power Users Use Amazon Quick', {
  x: 0.7, y: 1, w: 8, h: 1.5, bold: true, fontSize: 46,
  color: {
    type: 'gradient',
    stops: [
      { position: 0,   color: 'E3DDF1' },
      { position: 100, color: 'A78BFA' },
    ],
    direction: 0,
  },
})
```

`genXmlTextRunProperties` (`src/gen-xml.ts`) emits a run-level `<a:gradFill>` inside `<a:rPr>` when
`opts.color` is a `GradientFillProps` (`typeof opts.color === 'object' && opts.color.type === 'gradient'`);
a plain `Color` string keeps the unchanged `<a:solidFill>` path (byte-for-byte identical, default-off).

**Why `color` and not `fill`:** `TextPropsOptions.fill` already paints the **text-box background**
(`<p:spPr>` gradient rectangle behind the glyphs). Repurposing `fill` to mean the glyph fill would be
a **breaking change** for existing users relying on box-background fills. Routing glyph gradients
through `color` (whose solid form already fills the glyphs) is additive and non-breaking, and it
preserves the box-fill behaviour described in "Disambiguation" below.

## Problem

"Gradient text" — a heading whose glyphs are painted with a colour gradient — is a
ubiquitous title treatment, authored in CSS as:

```css
background: linear-gradient(135deg, #E3DDF1 30%, #A78BFA);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

PptxGenJS today applies a `fill` passed to `addText()` to the **text box**
(`<p:spPr>`), producing a gradient *rectangle behind* the text — not gradient
glyphs. There is no way to gradient-fill the glyphs themselves, so converters must
fake it (e.g. a per-word colour ramp), which is coarse and loses the smooth blend.

## Original proposal (superseded — shipped via `color`)

> The API below was the original `fill`-based proposal. The **shipped** form uses `color`
> (see "Implemented via `color`" above); the OOXML emitted is identical.

```ts
slide.addText('How Power Users Use Amazon Quick', {
  x: 0.7, y: 1, w: 8, h: 1.5, bold: true, fontSize: 46,
  fill: {
    type: 'gradient',
    stops: [
      { position: 0,   color: 'E3DDF1' },
      { position: 100, color: 'A78BFA' },
    ],
    direction: 0,            // 0 = horizontal, 90 = vertical, or 'horizontal'|'vertical'|'diagonal'
  },
})
```

Per-run support (a `TextProps[]` run can carry its own gradient `color`):

```ts
slide.addText([
  { text: 'Stop chatting. ', options: { color: { type:'gradient', stops:[...] } } },
  { text: 'Start orchestrating.', options: { color: 'A78BFA' } },
])
```

## OOXML

A gradient text fill is emitted as `<a:gradFill>` **inside the run properties**
(`<a:rPr>`), in the position normally occupied by `<a:solidFill>` (it replaces the
solid fill for that run). This is distinct from a shape `<p:spPr>` gradient fill.

```xml
<a:rPr lang="en-US" sz="4600" b="1">
  <a:gradFill>
    <a:gsLst>
      <a:gs pos="0"><a:srgbClr val="E3DDF1"/></a:gs>
      <a:gs pos="100000"><a:srgbClr val="A78BFA"/></a:gs>
    </a:gsLst>
    <a:lin ang="0" scaled="1"/>
  </a:gradFill>
</a:rPr>
<a:t>How Power Users Use Amazon Quick</a:t>
```

- Stop `position` (0–100) → `pos` in thousandths-of-a-percent (`×1000`), clamped `[0,100000]`.
- `direction` keyword/number → `<a:lin ang>` in 60,000ths of a degree.
- A gradient `color` replaces the run's `<a:solidFill>` with `<a:gradFill>`; a plain `Color`
  string is unchanged.

## Disambiguation: glyph fill vs box fill

- `addText(..., { color: <gradient> })` → **glyph** fill (`<a:rPr><a:gradFill>`).
- A gradient **box background** behind text remains available via `fill` (the text box's
  `<p:spPr>` fill) — i.e. `fill` semantics are unchanged. Keeping the two on separate properties
  (`color` = glyphs, `fill` = box) is exactly what avoids the ambiguity and the breaking change
  that routing `fill` to the run would have caused.

## Implementation location (shipped)

- `src/gen-xml.ts` → `genXmlTextRunProperties`: when `opts.color` is a `GradientFillProps`
  (`typeof opts.color === 'object' && opts.color.type === 'gradient'`), emit `<a:gradFill>` in the
  `<a:rPr>` via `genXmlColorSelection(opts.color)` instead of the `<a:solidFill>` produced for a
  plain `Color`.
- `src/core-interfaces.ts` → `TextPropsOptions.color` accepts `Color | GradientFillProps`.
- Reuses the existing `genXmlColorSelection` gradient stop/clamp logic shared with shape fills.

## Test cases

```ts
// Glyph gradient is emitted inside the run properties, not the shape properties
const s = pptx.addSlide()
s.addText('Gradient', { x:1, y:1, w:6, h:1, bold:true, fontSize:40,
  color: { type:'gradient', stops:[{position:0,color:'E8E4F0'},{position:100,color:'A78BFA'}], direction:0 } })
const xml = await renderSlideXml(s)
assert(/<a:rPr[^>]*>[\s\S]*?<a:gradFill>[\s\S]*?<\/a:gradFill>[\s\S]*?<\/a:rPr>/.test(xml)) // gradFill in rPr
assert(!/<p:spPr>[\s\S]*?<a:gradFill/.test(xml))                                            // NOT in spPr

// Stop scaling + angle
assert(/<a:gs pos="0"><a:srgbClr val="E8E4F0"\/><\/a:gs>/.test(xml))
assert(/<a:gs pos="100000"><a:srgbClr val="A78BFA"\/><\/a:gs>/.test(xml))
assert(/<a:lin ang="0"/.test(xml))

// Default-off: a run with only a plain `color` string is byte-identical (still <a:solidFill>)
```

> Shipped tests live in `test/feature-text-gradient.test.js` (SLICE-2b, commit `76feb308`).

## Impact on converter

Removes the `applyTextGradient()` per-word colour-ramp approximation (and its
`gradColorAt`/`hexToRgb`/`rgbToHexArr` helpers, ~30 lines). The converter's
`textGradientOf()` already produces a `GradientFillProps`; it would pass it straight
to `addText({ color })` for true smooth glyph gradients.
