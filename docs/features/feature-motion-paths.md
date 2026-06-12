# Feature: Motion Path Animations (`p:animMotion`)

> **Status:** Implemented (slice 3.1)
> **Priority:** Medium — Phase 3 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §5 Transitions & timing — "Motion paths"
>
> **Implemented:** `AnimationType` += `'motionPath'` and `path?` on `AnimationProps`
> (`src/core-interfaces.ts`); `MOTION_TYPES`/`isMotionAnim`, the `presetClass="path"`
> ternary arm, `motionPath: 0` in `presetMap`, the widened leading-`<p:set>` guard,
> and the `<p:animMotion>` payload branch in `src/gen-xml.ts`. Tested by the
> `animation-motion-path` schema fixture (`test/schema.test.js`).
>
> **Spec correction:** the `<p:animMotion>` `path` **attribute** takes the SVG-like
> command string **verbatim** in normalized 0–1 slide coordinates (with an appended
> ` E` end marker) — it is **NOT** routed through `svgPathToOoxml`, which builds
> `<a:custGeom>` EMU geometry for a shape's outline (a different mechanism). The path
> is validated against an allowed-token regex (`/^[MLCZmlcze0-9.,+\-\s]+$/`).

## Problem

Entrance/emphasis/exit effects move/scale/rotate in place, but there's no way
to animate an object **along a path**. OOXML expresses this with
`<p:animMotion>` (a path in the `path` attribute using SVG-like commands in
normalized 0–1 slide coordinates).

## Proposed API

```ts
slide.addShape('ellipse', {
  x: 1, y: 1, w: 0.5, h: 0.5, fill: '7C3AED',
  animation: {
    type: 'motionPath',
    path: 'M 0 0 L 0.3 -0.1 L 0.5 0',   // SVG-like, normalized to slide (0–1)
    duration: 1000,
    trigger: 'afterPrevious',
  },
})
```

(Optionally accept a few named presets later: `line`, `arc`, `loop`.)

## What it generates (OOXML)

Inside a `<p:par>` build step (`presetClass="path"`):

```xml
<p:animMotion origin="layout" path="M 0 0 L 0.3 -0.1 L 0.5 0 E" pathEditMode="relative">
  <p:cBhvr><p:cTn .../><p:tgtEl><p:spTgt spid="N"/></p:tgtEl>
    <p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst>
  </p:cBhvr>
</p:animMotion>
```

Path coordinates are normalized to the slide and emitted **verbatim** on the
`path` attribute (with an appended `E` end marker as PowerPoint expects). The
string is validated against an allowed-token regex — it is **not** routed through
`svgPathToOoxml` (that helper builds `<a:custGeom>` EMU geometry, a different
mechanism).

## Implementation location

- `src/core-interfaces.ts` — extend `AnimationType` with `'motionPath'` and add
  `path?: string` to `AnimationProps`.
- `src/gen-xml.ts` — emit `<p:animMotion>` in the timing payload builder with
  `presetClass="path"`.
- Pass the validated `path` string through verbatim (do **not** call
  `svgPathToOoxml`).

## Edge cases

- Validate the path string; reject unsupported commands with a warn.
- Default-off preserved; trigger grouping unchanged.

## Test cases

```ts
// motionPath emits <p:animMotion path="...E"> targeting ppt_x/ppt_y, presetClass="path"
```

## Acceptance

- Schema fixture validates clean. Matrix "Motion paths" → `✅ Done`.
- Docs + demo + `CHANGELOG.md` `Added`.
