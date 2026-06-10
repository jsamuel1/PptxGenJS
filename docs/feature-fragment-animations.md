# Feature: Fragment build-steps — incremental reveal output expectations

> **Status:** Implemented
> **Created:** 2026-06-10
> **Target:** `@jsamuel1/pptxgenjs` core (animation timing tree)
> **Found by:** the `html-to-pptx` converter mapping reveal `.fragment` incremental reveals.
>   Consumer-side mapping/plan: `html-to-pptx/docs/feature-fragments.md`.

## Problem

reveal `.fragment` elements reveal one step at a time, with optional effects
(grow/shrink/fade-out/fade-directions/highlight). The converter already drives incremental
entrance steps via its `.dN` sequencer using the library's entrance/emphasis/exit
animations, so most fragment mapping is consumer-side. This doc pins the **output
behaviours the library must guarantee** for the richer fragment effects, and asks for
regression coverage so a future timing-tree change can't silently break multi-step builds.

## Output behaviours required

For a slide with N ordered build steps (one per fragment / per shared `data-fragment-index`):

1. **Per-step ordering** — `afterPrevious` chaining produces N distinct click/auto steps in
   source order; shapes sharing a step use `withPrevious` (one reveal). (Already used by the
   converter's counter/odometer + `.dN` grouping; needs to hold for arbitrary element types.)
2. **Compound fragments** — an element that both enters and later exits
   (reveal `fade-in-then-out`) must be expressible as two steps on the SAME shape
   (entrance step k, exit step k+m) with correct, unique `<p:cTn id>`s in one timing tree.
3. **Emphasis mid-sequence** — `highlight-*` maps to `colorPulse` as a build step between
   neighbouring entrances without resetting the sequence.

These are exercised by, but not specific to, reveal — any framework with ordered reveals
benefits.

## Tests (this lives in the library)

Output-producing timing-tree tests:

- A slide with three shapes each given an entrance `afterPrevious` emits three sequential
  `<p:par>`/`<p:cTn>` steps with unique ids, in order.
- A shape given entrance-then-exit emits both, on the same shape id, with a valid timing
  tree (no duplicate `cTn id`, correct child order `cSld → … → timing`).
- A `colorPulse` emphasis inserted between two entrances does not break the chain.

## Acceptance Criteria

- [x] Documented guarantee + tests that N ordered build steps emit N valid, uniquely-id'd
      timing nodes in order.
- [x] A single shape can carry an entrance AND a later exit step in one slide's timing tree.
- [x] `colorPulse`/emphasis can sit between entrance steps without disrupting ordering.
