# Feature: addCard() — Structured Card Rendering

> **Status:** Implemented (v4.2.0)  
> **Implemented:** `src/gen-objects.ts` (`addCardDefinition`); instance method `src/slide.ts` (`addCard`); types `src/core-interfaces.ts` (`CardProps`); tests `test/feature-card.test.js`  
> **Priority:** Medium — common pattern, reduces boilerplate significantly

## Problem

Rendering a "card" (rounded rectangle with icon, title, description) requires
5–8 API calls per card:
1. `addShape('roundRect', ...)` — background
2. `addShape('roundRect', ...)` — icon container
3. `addShape(svgPath, ...)` or `addText(emoji, ...)` — icon
4. `addText(title, ...)` — title
5. `addText(description, ...)` — description
6. Optionally: shadow, border, badge

This is the most common pattern in presentation decks (capability grids, feature
lists, team cards, pricing tiers). Every converter reimplements it.

## Proposed API

```ts
slide.addCard({
  // Position (required)
  x: 1, y: 2, w: 3.5, h: 2.5,

  // Content
  title: 'Knowledge Graph',
  description: 'Personal context memory across all interactions',
  icon?: { svgPath: { d: '...', viewBox: { w: 24, h: 24 } } },  // or emoji string,
                                                                // or font-icon { char, fontFace, color? }
  badge?: { text: 'NEW', fill: '10B981' },

  // Styling
  fill: '1a1a24',
  border?: { color: '2A2438', width: 1 },
  cornerRadius: 0.12,          // inches
  shadow?: { blur: 8, offset: 2, color: '000000', opacity: 0.3 },
  glow?: { size: 4, color: '7C3AED', opacity: 0.2 },

  // Text styling
  titleFont?: { face: 'Inter', size: 13, bold: true, color: 'E4E4ED' },
  descFont?: { face: 'Inter', size: 10, color: '8A8A9A' },
  iconSize?: 0.4,              // inches (icon container size)
  iconFill?: '7C3AED12',      // icon background (with alpha); 'none' or false = bare icon (no tile)
  iconColor?: 'A78BFA',       // icon glyph accent colour (independent of the tile)

  // Layout
  align?: 'center' | 'left',  // content alignment within card
  iconPosition?: 'top' | 'left',  // icon placement

  // Animation (applied to the whole card as a group)
  animation?: { type: 'fadeIn', group: 3 }
})
```

## What it generates

Internally, `addCard()` creates a group (`addGroup`) containing:
1. Background `roundRect` with fill, border, shadow, glow
2. Icon container (small `roundRect` with icon fill)
3. Icon shape (SVG path via `svgPath`, or text emoji)
4. Title text box
5. Description text box (with `fit: 'shrink'` for overflow)
6. Optional badge (small `roundRect` + centred text, positioned top-right)

All children use relative coordinates within the group.

## Layout calculation (align: 'center', iconPosition: 'top')

```
┌──────────────────────────┐
│     ┌────────────┐       │  iconContainer: centred, y=padding
│     │   🔮 icon  │       │  size: iconSize × iconSize
│     └────────────┘       │
│                          │
│    Knowledge Graph       │  title: y = padding + iconSize + gap
│                          │
│  Personal context memory │  desc: y = title.y + title.h + smallGap
│  across all interactions │
│                          │
└──────────────────────────┘
```

## Implementation location

- `src/slide.ts` → new `addCard()` method on `PresSlide`
- `src/core-interfaces.ts` → `CardProps` interface
- Internally calls `this.addGroup()` + group children
- Depends on: `addGroup`, `addShape`, `addText`, `svgPath`, `shadow`, `glow`

## Test cases

```ts
// Minimal card
slide.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Hello', fill: '1a1a24' })
// Expected: roundRect bg + title text box

// Full card with icon, description, badge, shadow
slide.addCard({
  x: 1, y: 1, w: 3.5, h: 2.5,
  title: 'Scheduled Agents',
  description: 'Autonomous monitors that run on a schedule',
  icon: { svgPath: { d: 'M21 11V6...', viewBox: { w: 24, h: 24 } } },
  badge: { text: 'ACTIVE', fill: '10B981' },
  fill: '1a1a24',
  shadow: { blur: 8, offset: 2, color: '000000', opacity: 0.3 },
  cornerRadius: 0.12,
  animation: { type: 'fadeIn', group: 2, stagger: 100 }
})
// Expected: grouped shape set with all elements
```

## Impact on converter

The `html-to-pptx` converter's `renderCapGrid()` currently has ~60 lines per card
(manual positioning of bg + icon + title + desc). With `addCard()` + `layoutGrid()`:

```js
const grid = pptx.layoutGrid({ items: 6, columns: 3, area, gap: 0.2 })
items.forEach((item, i) => {
  slide.addCard({ ...grid[i], title: item.title, description: item.desc, icon: item.icon })
})
```

6 lines replaces 60.
