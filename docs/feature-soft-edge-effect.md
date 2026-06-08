# Feature: Soft Edge Effect (`a:softEdge`)

> **Status:** Proposed
> **Priority:** Medium — Phase 2 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §3 Fills/effects — "Soft edge"

## Problem

No support for soft (feathered) edges on shapes/images. OOXML expresses this as
a single `<a:softEdge rad="..."/>` inside `<a:effectLst>`.

## Proposed API

```ts
slide.addShape('ellipse', {
  x: 1, y: 1, w: 3, h: 3, fill: '7C3AED',
  softEdge: { radius: 0.1 },   // inches (feather radius)
})
```

## What it generates (OOXML)

```xml
<a:softEdge rad="91440"/>   <!-- radius inches → EMU (×914400) -->
```

Placed inside the shared `<a:effectLst>` in canonical `CT_EffectList` order
(after reflection, before/with the rest).

## Implementation location

- `src/core-interfaces.ts` — `SoftEdgeProps { radius: number }`; add
  `softEdge?` to `ShapeProps`/image props.
- `src/gen-xml.ts` — extend the `<a:effectLst>` builder.

## Edge cases

- Coexists with shadow/glow/reflection; maintain canonical child order.
- `radius` ≤ 0 → omit the effect.
- Default-off preserved.

## Test cases

```ts
// softEdge emits <a:softEdge rad="..."> with inches→EMU conversion
// combined with other effects → single effectLst, correct order
```

## Acceptance

- Schema fixture validates clean. Matrix "Soft edge" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
