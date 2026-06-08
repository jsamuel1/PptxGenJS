# Feature: Emphasis Animations (`p:animClr`, `p:animScale`, `p:animRot`)

> **Status:** Implemented
> **Implemented:** `AnimationType` + emphasis props (`spinDegrees`/`growScale`/`color`) in
> `src/core-interfaces.ts`; `EMPHASIS_TYPES`/`isEmphasisAnim`, `presetClass="emph"`,
> gated visibility `<p:set>`, and the spin/grow/colorPulse/pulse payload branches in
> `src/gen-xml.ts` (`genXmlAnimPayload`/`renderMember`). Tests: `animation-emphasis`
> fixture in `test/schema.test.js` (schema-valid + raw-emission regression-catch). Demo:
> `demos/modules/demo_animation.mjs` (`genSlide_EmphasisAnimations`).
> **Priority:** High — Phase 1 (matrix `❌ Missing` → `✅`); reuses the existing timing engine
> **Matrix row:** §5 Transitions & timing — "Emphasis effects"

## Problem

The library supports **entrance** animations (`appear`, `fadeIn`, `flyIn`,
`zoomIn`) but no **emphasis** effects (pulse, spin, grow, color change) that
draw attention to an already-visible object. The `genXmlTiming` engine already
emits real sequential build steps under `<p:seq nodeType="mainSeq">`, so
emphasis effects slot into the same structure with `presetClass="emph"`.

## Proposed API

```ts
slide.addText('Important', {
  x: 1, y: 1, w: 4, h: 1,
  animation: {
    type: 'pulse',          // 'pulse' | 'spin' | 'grow' | 'colorPulse'
    duration: 500,
    trigger: 'afterPrevious',
    // type-specific:
    spinDegrees?: 360,      // spin
    growScale?: 1.5,        // grow (×)
    color?: 'FF0000',       // colorPulse target
  },
})
```

Extend `AnimationType` with the emphasis set (start minimal: `pulse`, `spin`,
`grow`, `colorPulse`).

## What it generates (OOXML)

Inside the per-shape effect node within a `<p:par>` build step, with
`presetClass="emph"` (not `entr`):

```xml
<!-- spin → animRot -->
<p:animRot by="21600000"><p:cBhvr>…<p:attrName>r</p:attrName>…</p:cBhvr></p:animRot>
<!-- grow → animScale -->
<p:animScale><p:cBhvr>…</p:cBhvr><p:by x="150000" y="150000"/></p:animScale>
<!-- colorPulse → animClr -->
<p:animClr clrSpc="rgb"><p:cBhvr>…</p:cBhvr><p:to><a:srgbClr val="FF0000"/></p:to></p:animClr>
```

The wrapping `<p:cTn ... presetClass="emph" presetID=N>` labels the effect in
the PowerPoint UI (use the correct `presetID` per effect).

## Implementation location

- `src/core-interfaces.ts` — extend `AnimationType`; add the emphasis-specific
  optional props to `AnimationProps`.
- `src/gen-xml.ts` — in the animation payload builder (alongside the existing
  `fadeIn`/`flyIn`/`zoomIn` branches) add `pulse`/`spin`/`grow`/`colorPulse`,
  and set `presetClass="emph"` + the right `presetID`.

## Edge cases

- Emphasis effects keep the same trigger/stagger grouping semantics as entrance.
- Default-off: no `<p:timing>` emitted when no object is animated.

## Test cases

```ts
// spin emits <p:animRot> with presetClass="emph"; grow emits <p:animScale>;
// colorPulse emits <p:animClr> with the target color; pulse emits the standard pulse.
// trigger grouping (afterPrevious/withPrevious) still produces correct <p:par> steps.
```

## Acceptance

- Schema fixture per effect validates clean.
- Matrix "Emphasis effects" → `✅ Done`.
- `website/docs/api-text.md` (or an animations doc) documents the effects.
- `demos/modules/demo_animation.mjs` extended; `CHANGELOG.md` `Added` entry.
