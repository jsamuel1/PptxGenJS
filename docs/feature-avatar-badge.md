# Feature: Avatar & Badge Helpers — `addAvatar()` / `addBadge()`

> **Status:** Proposed
> **Target:** `src/slide.ts` (`addAvatar`, `addBadge`), `src/gen-objects.ts`, `src/core-interfaces.ts` (`AvatarProps`, `BadgeProps`), tests `test/feature-avatar-badge.test.js`
> **Priority:** Low — small, high-convenience primitives that recur in UI mockups and cards

## Problem

Two tiny UI primitives appear constantly in decks (sidebars, profile rows, cards,
notification chips) and every converter re-creates them by hand from a shape + a
centred text box:

- **Avatar / initials chip** — a filled circle with 1–2 centred initials
  (e.g. a user avatar "JS" on a purple disc).
- **Badge / pill** — a small rounded chip or circle holding a short label or count
  (e.g. "NEW", "ACTIVE", a "3" notification count).

Hand-rolling each is 2 calls plus fiddly centring math; standardising them removes
boilerplate and guarantees the glyph is centred correctly.

## Proposed API

```ts
slide.addAvatar({
  x: 1, y: 1, size: 0.4,        // diameter (inches)
  initials: 'JS',
  fill: '4B3F72',               // disc colour
  color: 'FFFFFF',              // initials colour (default 'FFFFFF')
  fontFace?: string,            // default deck font
  fontSize?: number,            // default derived from size
  animation?: AnimationProps,
})

slide.addBadge({
  x: 1, y: 1,
  text: '3',
  shape?: 'circle' | 'pill',    // default 'pill' (or 'circle' when text is 1–2 chars)
  w?: number, h?: number,       // optional explicit size; else sized to text
  fill: '7C3AED',
  color: 'FFFFFF',              // default 'FFFFFF'
  fontSize?: number,            // default 7–8pt
  bold?: boolean,               // default true
  animation?: AnimationProps,
})
```

```ts
export interface AvatarProps extends PositionProps, ObjectNameProps {
  initials: string
  size: number
  fill: HexColor
  color?: HexColor
  fontFace?: string
  fontSize?: number
  animation?: AnimationProps
}
export interface BadgeProps extends PositionProps, ObjectNameProps {
  text: string
  shape?: 'circle' | 'pill'
  fill: HexColor
  color?: HexColor
  fontSize?: number
  bold?: boolean
  animation?: AnimationProps
}
```

## Behaviour

- **`addAvatar`**: draws an `ellipse` (`size`×`size`) filled with `fill`, then a
  centred `addText(initials)` (`align:'center', valign:'middle'`). `fontSize`
  defaults to roughly `size × 72 × 0.4`. Returns the slide for chaining.
- **`addBadge`**:
  - `shape:'circle'` → an `ellipse` sized to `max(h, textWidth)` (a count bubble).
  - `shape:'pill'` (default) → a `roundRect` with full corner radius, width sized to
    the text (`~0.1×len + padding`) unless `w` is given.
  - then a centred `addText`. `bold` defaults to `true`, `color` to `FFFFFF`.

Both are pure compositions of existing primitives (no new OOXML).

## Implementation location

- `src/slide.ts` → `addAvatar()` / `addBadge()` methods on `PresSlide` (and on the
  group handle from `addGroup`, so they can sit inside mockups)
- `src/gen-objects.ts` → `addAvatarDefinition` / `addBadgeDefinition`
- `src/core-interfaces.ts` → `AvatarProps`, `BadgeProps`

## Test cases

```ts
// Avatar: ellipse + centred initials
const s = pptx.addSlide()
s.addAvatar({ x:1, y:1, size:0.4, initials:'JS', fill:'4B3F72' })
// Expected: one ellipse (fill 4B3F72) + one centred text 'JS' (white)

// Badge pill (label)
s.addBadge({ x:2, y:1, text:'NEW', fill:'10B981' })
// Expected: roundRect sized to text + centred bold white 'NEW'

// Badge circle (count)
s.addBadge({ x:3, y:1, text:'3', shape:'circle', fill:'7C3AED' })
// Expected: ellipse (count bubble) + centred '3'

// Inside a group (mockup sidebar footer)
const g = s.addGroup({ x:7, y:1, w:2, h:0.5 })
g.addAvatar({ x:0, y:0, size:0.3, initials:'JS', fill:'4B3F72' })
g.addText('Joshua Samuel', { x:0.4, y:0, w:1.5, h:0.3, valign:'middle' })
```

## Impact on converter

Replaces the converter's inline avatar rendering (the `avatarOf`/`findAvatar`
detection still finds them in source, but the draw becomes `slide.addAvatar(...)`)
and the badge drawing in `renderCapGrid` / the mockup sidebar's notification-count
logic — collapsing each to a single call and removing the manual ellipse + centred
text pairs (~15 lines across the mockup and card renderers).
