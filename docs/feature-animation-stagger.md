# Feature: Animation Stagger (Auto-Grouping)

> **Status:** Proposed  
> **Priority:** High — eliminates manual trigger/delay assignment in converters

## Problem

When building animated slides, every item needs explicit `animation: { trigger, delay }`
assignment. The common pattern is:
- Items in the same visual group animate together (`withPrevious`)
- Groups reveal sequentially (`afterPrevious`)
- Within a group, items may stagger by a small delay

This grouping logic is currently in the converter script (~40 lines of
`makeSequencer()` + `delayGroupOf()` logic). It should be a library-level
utility so any builder gets correct animation grouping without reimplementing it.

## Proposed API

### Option A: Declarative `animationGroup` property

```ts
// Items with the same group number animate together (withPrevious)
// Different group numbers animate sequentially (afterPrevious between groups)
slide.addText('Title', { animation: { type: 'fadeIn', group: 1 } })
slide.addText('Subtitle', { animation: { type: 'fadeIn', group: 1 } })
// ^ Both fade in together

slide.addText('Body', { animation: { type: 'fadeIn', group: 2 } })
// ^ Fades in AFTER group 1 completes

slide.addText('Card 1', { animation: { type: 'appear', group: 3, stagger: 100 } })
slide.addText('Card 2', { animation: { type: 'appear', group: 3, stagger: 100 } })
slide.addText('Card 3', { animation: { type: 'appear', group: 3, stagger: 100 } })
// ^ All in group 3, each staggered by 100ms within the group
```

### Option B: `staggerAnimation()` helper

```ts
const items = ['Card 1', 'Card 2', 'Card 3', 'Card 4', 'Card 5', 'Card 6']
const grid = pptx.layoutGrid({ items: 6, columns: 3, area: {...}, gap: 0.2 })

pptx.staggerAnimation(slide, items.map((text, i) => ({
  type: 'text',
  content: text,
  position: grid[i],
  options: { fontSize: 14, fill: '1a1a24' }
})), {
  animation: 'fadeIn',
  staggerMs: 100,           // delay between each item
  groupSize: 3,             // items per group (row-by-row reveal)
  groupAnimation: 'afterPrevious',  // between groups
  itemAnimation: 'withPrevious',    // within a group
})
```

## Recommended: Option A (simpler, composable)

Option A is simpler — it adds a `group` field to `AnimationProps` and a `stagger`
field. The library's `genXmlTiming` already handles `withPrevious`/`afterPrevious`
via build steps. The only new logic:

1. In `genXmlTiming`, when grouping animated objects into build steps:
   - Objects with the same `group` number → same build step (`withPrevious`)
   - Objects with different `group` numbers → separate steps (`afterPrevious`)
   - Within a group, if `stagger` is set, apply cumulative delay: item N gets
     `delay = N * stagger` (relative to the group's container start)

2. If no `group` is set, fall back to existing `trigger` behaviour (backwards-compat).

## Interface additions

```ts
// In core-interfaces.ts
export interface AnimationProps {
  type: AnimationType
  duration?: number
  delay?: number
  trigger?: AnimationTrigger
  direction?: TransitionDirection
  // NEW:
  group?: number          // Animation group ID (same group = withPrevious)
  stagger?: number        // ms delay between items within the same group
}
```

## OOXML output

Same as current — the `group` and `stagger` fields are just syntactic sugar that
get resolved to existing `trigger` + `delay` values before `genXmlTiming` runs.
No new XML elements needed.

## Implementation location

- `src/gen-xml.ts` → `genXmlTiming()`: add pre-processing step that resolves
  `group`/`stagger` into `trigger`/`delay` before the existing build-step logic
- `src/core-interfaces.ts` → add `group?` and `stagger?` to `AnimationProps`

## Test cases

```ts
// Two items in same group → one build step
slide.addText('A', { animation: { type: 'fadeIn', group: 1 } })
slide.addText('B', { animation: { type: 'fadeIn', group: 1 } })
// Expected XML: one <p:par> step with two withEffect members

// Stagger within group
slide.addText('C1', { animation: { type: 'appear', group: 2, stagger: 100 } })
slide.addText('C2', { animation: { type: 'appear', group: 2, stagger: 100 } })
slide.addText('C3', { animation: { type: 'appear', group: 2, stagger: 100 } })
// Expected: one step, delays 0/100/200 on each member

// Different groups → sequential steps
slide.addText('X', { animation: { type: 'fadeIn', group: 1 } })
slide.addText('Y', { animation: { type: 'fadeIn', group: 2 } })
// Expected: two <p:par> steps under mainSeq
```

## Impact on converter

The `html-to-pptx` converter's `makeSequencer()` function (~40 lines) reduces to:
```js
animation: { type: animType, group: delayGroup, stagger: 100 }
```
No manual `withPrevious`/`afterPrevious` decision logic needed.
