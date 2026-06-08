# Feature: Exit Animations

> **Status:** Proposed
> **Priority:** High — Phase 1 (matrix `❌ Missing` → `✅`); infra already exists
> **Matrix row:** §5 Transitions & timing — "Exit effects"

## Problem

The library has entrance animations but no **exit** effects (the counterpart:
make an object leave). The counter (odometer) sugar already performs an
exit-style visibility toggle internally, so the timing infrastructure exists —
it just isn't exposed as a first-class animation.

## Proposed API

```ts
slide.addText('Goodbye', {
  x: 1, y: 1, w: 4, h: 1,
  animation: {
    type: 'fadeOut',   // 'disappear' | 'fadeOut' | 'flyOut' | 'zoomOut'
    duration: 400,
    trigger: 'afterPrevious',
    direction?: 'right',   // flyOut direction
  },
})
```

Add exit variants to `AnimationType` (or an `{ kind:'exit' }` discriminator —
prefer extending the union for API symmetry with entrance).

## What it generates (OOXML)

Same `<p:par>` build-step structure, but `presetClass="exit"` and the reverse
behavior of the entrance counterpart:

```xml
<!-- disappear → set visible:false -->
<p:set><p:cBhvr>…<p:attrName>style.visibility</p:attrName>…</p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>
<!-- fadeOut → animEffect filter="fade" transition="out" -->
<p:animEffect transition="out" filter="fade"><p:cBhvr>…</p:cBhvr></p:animEffect>
<!-- flyOut → anim on ppt_x/ppt_y toward an offscreen #ppt_x±1slide -->
<!-- zoomOut → animScale toward 0 -->
```

with `<p:cTn ... presetClass="exit" presetID=N>`.

## Implementation location

- `src/core-interfaces.ts` — extend `AnimationType` with exit types.
- `src/gen-xml.ts` — add exit branches mirroring the entrance ones (reverse the
  fly/zoom direction; visibility → hidden); set `presetClass="exit"`.

## Edge cases

- Exit + entrance on the same object across steps must order correctly (entrance
  first build step, exit later) — verify the `<p:seq>` ordering.
- Default-off invariant preserved.

## Test cases

```ts
// fadeOut emits <p:animEffect transition="out" filter="fade"> with presetClass="exit"
// flyOut emits directional <p:anim> toward offscreen; zoomOut scales to 0
// disappear emits <p:set> visibility hidden
```

## Acceptance

- Schema fixture per exit type validates clean.
- Matrix "Exit effects" → `✅ Done`.
- Docs + demo updated; `CHANGELOG.md` `Added` entry.
