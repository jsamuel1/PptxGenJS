# Feature: Auto-Animate morph — tween matched elements across consecutive slides

> **Status:** Proposed
> **Created:** 2026-06-10
> **Target:** `@jsamuel1/pptxgenjs` core (animation / morph)
> **Found by:** the `html-to-pptx` converter rendering the reveal.js demo "Auto-Animate"
>   slides (`data-auto-animate`, matched `data-id` boxes that move/resize/recolour across
>   slides). Consumer-side detection lives in the converter; the morph OUTPUT must be the
>   library's.

## Problem

reveal's Auto-Animate makes elements with the same `data-id` on consecutive slides tween
between their two states (position, size, colour) — the visual highlight of the demo.
PowerPoint's analogue is the **Morph transition**, which automatically animates shapes that
match between two slides. PptxGenJS has slide transitions (fade/push/wipe/…) but **no Morph
transition** and no notion of matched shapes, so a consumer can only emit the start/end
slides as independent steps with no tween.

## Proposed API

1. **A `morph` slide transition:**
   ```ts
   slide.transition = { type: 'morph', duration: 700, option: 'byObject' /* | 'byWord' | 'byChar' */ }
   ```
   emitting the OOXML `<p:transition><p14:morph .../></p:transition>` (the
   `p14`/`p159` morph transition element) so PowerPoint tweens matching shapes between the
   previous slide and this one.

2. **Stable shape matching:** let callers tag shapes so Morph pairs them reliably:
   ```ts
   slide.addShape('roundRect', { ..., morphId: 'box1' })  // -> stable name/cNvPr id pair
   ```
   Morph matches by shape name/id; a `morphId` that the library writes onto both slides'
   shapes makes the pairing deterministic (mirrors reveal's `data-id`).

## Why upstream

Morph is a transition + shape-identity feature realised entirely in OOXML — squarely the
library's domain. A consumer cannot synthesise a Morph tween from outside; it can only map
`data-auto-animate` + `data-id` onto these APIs once they exist.

## Tests (this lives in the library)

Output-producing:

- `slide.transition = { type:'morph' }` emits a valid `p14:morph` transition element.
- Two slides with shapes sharing a `morphId` emit matching shape identities so PowerPoint
  pairs them (assert the cNvPr name/id correspondence).
- A deck with no morph transitions is unchanged (regression).

## Acceptance Criteria

- [ ] A `morph` slide transition type emitting the correct (namespaced) OOXML.
- [ ] A `morphId` (stable shape name) so matching shapes pair deterministically.
- [ ] Verified to animate in PowerPoint; degrades gracefully where Morph is unsupported.

## Consumer mapping (informational)

The converter would map `data-auto-animate` on consecutive `<section>`s to
`transition:{type:'morph'}` on the second slide, and matched `data-id` values to `morphId`
on the corresponding shapes — once the above ships.
