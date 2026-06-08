# Feature: 3-D Bevel / Extrusion on Shapes (`a:sp3d`, `a:scene3d`)

> **Status:** Implemented (slice 2.3)
> **Priority:** Low/Medium — Phase 2 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §3 Fills/effects — "3-D (bevel/extrusion)"
>
> **Implemented:** `bevel?: Shape3DProps` on `ShapeProps` (`src/core-interfaces.ts`);
> `BevelPresetType`/`PresetMaterialType` enums (`src/core-enums.ts`);
> `createShape3DElement` (`src/gen-utils.ts`); shape-path emit in `src/gen-xml.ts`
> (after the `<a:effectLst>` block, before `</p:spPr>`). Tested by the `shape-3d`
> fixture in `test/schema.test.js`.
>
> **Spec corrections (the schema, not the example below, is authoritative):**
> 1. **`<a:scene3d>` MUST precede `<a:sp3d>`** — canonical `CT_ShapeProperties`
>    order is `…effectLst, scene3d, sp3d, extLst`. The "What it generates" block
>    below shows them reversed (sp3d first); the implementation emits scene3d first.
> 2. **`extrusionClr`/`contourClr` are CHILD elements, not `<a:sp3d>` attributes.**
>    `CT_Shape3D` attributes are only `z, extrusionH, contourW, prstMaterial`;
>    extrusion/contour colors are `CT_Color` children
>    (`<a:extrusionClr><a:srgbClr val="…"/></a:extrusionClr>`).
> 3. There is no chart bevel preset enum to "generalize" — the new
>    `BevelPresetType`/`PresetMaterialType` enums are added fresh.

## Problem

A `bevel` enum exists for **charts** only; shapes have no 3-D support. OOXML
provides `<a:sp3d>` (bevels, extrusion, contour, material) and `<a:scene3d>`
(camera + light rig) for true 3-D on any shape.

## Proposed API

```ts
slide.addShape('rect', {
  x: 1, y: 1, w: 3, h: 2, fill: '7C3AED',
  bevel: {
    top?:    { preset: 'circle', width: 0.06, height: 0.06 },  // inches
    bottom?: { preset: 'circle', width: 0.06, height: 0.06 },
    depth?:  { color: '5B21B6', amount: 0.08 },                // extrusion
    contour?:{ color: '000000', width: 0.01 },
    material?: 'matte' | 'plastic' | 'metal' | 'warmMatte',
  },
})
```

## What it generates (OOXML)

```xml
<a:sp3d extrusionH="73152" extrusionClr="…" contourW="…" contourClr="…" prstMaterial="plastic">
  <a:bevelT w="54864" h="54864" prst="circle"/>
  <a:bevelB w="54864" h="54864" prst="circle"/>
</a:sp3d>
<a:scene3d>
  <a:camera prst="orthographicFront"/>
  <a:lightRig rig="threePt" dir="t"/>
</a:scene3d>
```

Reuse/generalize the existing chart bevel enum for `prst` bevel presets.
Units: inches → EMU. `<a:scene3d>` uses a sensible default camera/light rig
unless overridden.

## Implementation location

- `src/core-interfaces.ts` — `Shape3DProps`/`bevel?` on `ShapeProps`.
- `src/core-enums.ts` — bevel preset + material enums (generalize chart bevel).
- `src/gen-xml.ts` — emit `<a:sp3d>` + `<a:scene3d>` on the shape's `<p:spPr>`
  in the correct child position.

## Edge cases

- `<a:sp3d>` requires a `<a:scene3d>` to render in PowerPoint — emit a default
  scene when bevel/extrusion is set but no scene specified.
- Default-off preserved.

## Test cases

```ts
// bevel emits <a:sp3d> with <a:bevelT>/<a:bevelB> + a default <a:scene3d>
// extrusion (depth) emits extrusionH/extrusionClr
```

## Acceptance

- Schema fixture validates clean. Matrix "3-D" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
