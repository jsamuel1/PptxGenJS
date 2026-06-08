# Feature: 3-D Bevel / Extrusion on Shapes (`a:sp3d`, `a:scene3d`)

> **Status:** Proposed
> **Priority:** Low/Medium — Phase 2 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §3 Fills/effects — "3-D (bevel/extrusion)"

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
