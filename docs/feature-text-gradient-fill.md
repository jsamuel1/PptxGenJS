# Feature: Gradient Text Glyph Fills

> **Status:** Proposed
> **Target:** `src/gen-xml.ts` (text run properties), `src/core-interfaces.ts` (`TextPropsOptions.fill`), tests `test/feature-text-gradient.test.js`
> **Priority:** Medium — common hero/title treatment; current `fill` on text fills the BOX, not the glyphs

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

## Proposed API

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

Per-run support (a `TextProps[]` run can carry its own gradient `fill`):

```ts
slide.addText([
  { text: 'Stop chatting. ', options: { fill: { type:'gradient', stops:[...] } } },
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
- When a run has **both** `color` and a gradient `fill`, the gradient wins for the
  glyph fill (with `color` retained only as a fallback hint for non-supporting viewers).

## Disambiguation: glyph fill vs box fill

- `addText(..., { fill: <gradient> })` on a **text-only** element → glyph fill
  (`<a:rPr><a:gradFill>`).
- A gradient **box background** behind text remains available via `addShape` (the
  text box's `<p:spPr>` fill) — i.e. shape-level fills are unchanged. To avoid
  ambiguity the proposal routes `addText` `fill` to the run (glyph) fill; box
  backgrounds should be drawn as a separate shape.

## Implementation location

- `src/gen-xml.ts` → in the run-properties (`genXmlBodyProperties`/text-run) builder,
  when `opts.fill?.type === 'gradient'`, emit `<a:gradFill>` in the `<a:rPr>` instead
  of `<a:solidFill>`
- `src/core-interfaces.ts` → `TextPropsOptions.fill` already accepts `GradientFillProps`
  in the type; this proposal defines its glyph-fill semantics for text runs
- Reuse the existing `genXmlGradientFill` stop/clamp logic shared with shape fills

## Test cases

```ts
// Glyph gradient is emitted inside the run properties, not the shape properties
const s = pptx.addSlide()
s.addText('Gradient', { x:1, y:1, w:6, h:1, bold:true, fontSize:40,
  fill: { type:'gradient', stops:[{position:0,color:'E8E4F0'},{position:100,color:'A78BFA'}], direction:0 } })
const xml = await renderSlideXml(s)
assert(/<a:rPr[^>]*>[\s\S]*?<a:gradFill>[\s\S]*?<\/a:gradFill>[\s\S]*?<\/a:rPr>/.test(xml)) // gradFill in rPr
assert(!/<p:spPr>[\s\S]*?<a:gradFill/.test(xml))                                            // NOT in spPr

// Stop scaling + angle
assert(/<a:gs pos="0"><a:srgbClr val="E8E4F0"\/><\/a:gs>/.test(xml))
assert(/<a:gs pos="100000"><a:srgbClr val="A78BFA"\/><\/a:gs>/.test(xml))
assert(/<a:lin ang="0"/.test(xml))

// Default-off: a run with only `color` is byte-identical (still <a:solidFill>)
```

## Impact on converter

Removes the `applyTextGradient()` per-word colour-ramp approximation (and its
`gradColorAt`/`hexToRgb`/`rgbToHexArr` helpers, ~30 lines). The converter's
`textGradientOf()` already produces a `GradientFillProps`; it would pass it straight
to `addText({ fill })` for true smooth glyph gradients.
