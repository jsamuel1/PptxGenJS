# Feature: Reflection Effect (`a:reflection`)

> **Status:** Proposed
> **Priority:** Medium — Phase 2 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §3 Fills/effects — "Reflection"

## Problem

Shadow and glow effects are supported (`<a:outerShdw>`, `<a:glow>` inside
`<a:effectLst>`), but reflection is not. Reflection is a common polished-deck
effect for images and shapes.

## Proposed API

```ts
slide.addShape('rect', {
  x: 1, y: 1, w: 4, h: 2, fill: '7C3AED',
  reflection: {
    blur?: 0.5,        // pt
    distance?: 0,      // pt — gap between object and reflection
    size?: 50,         // % — how much of the object is reflected (0–100)
    opacity?: 50,      // % start alpha
    fadeDirection?: 90 // degrees (default 90 = downward fade)
  },
})
```

## What it generates (OOXML)

Inside the shared `<a:effectLst>` (alongside any shadow/glow):

```xml
<a:reflection blurRad="6350" stA="50000" endA="300" endPos="50000"
              dist="0" dir="5400000" sy="-100000" rotWithShape="0"/>
```

Unit conversions: pt → EMU (×12700), degrees → 60,000ths, % → thousandths.

## Implementation location

- `src/core-interfaces.ts` — `ReflectionProps`; add `reflection?` to `ShapeProps`
  (and image props where shadow/glow already apply).
- `src/gen-xml.ts` — extend the `<a:effectLst>` builder (the one that already
  emits `outerShdw`/`glow`) to include `<a:reflection>`.

## Edge cases

- Must coexist with shadow + glow in **one** `<a:effectLst>` in the correct
  child order (shadow, reflection, glow, softEdge per `CT_EffectList`).
- Default-off preserved.

## Test cases

```ts
// reflection emits <a:reflection> with converted attrs inside the single effectLst
// shadow + reflection + glow together emit one effectLst in canonical order
```

## Acceptance

- Schema fixture validates clean (incl. combined effects ordering).
- Matrix "Reflection" → `✅ Done`. Docs + `CHANGELOG.md` `Added`.
