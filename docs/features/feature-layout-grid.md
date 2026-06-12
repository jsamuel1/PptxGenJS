# Feature: layoutGrid()

> **Status:** Implemented (v4.2.0)  
> **Implemented:** src/gen-utils.ts (layoutGrid), instance method re-exported via src/pptxgen.ts; tests test/feature-layout-grid.test.js  
> **Priority:** High — eliminates repetitive grid-math in every converter/builder

## Problem

Any code that positions items in a grid (capability cards, icon grids, comparison
layouts) must manually compute `x`, `y`, `w`, `h` for each cell. This math is:
- Repeated in every project using PptxGenJS
- Error-prone (off-by-one gaps, overflow past slide edge)
- Hard to maintain when item count or area changes

## Proposed API

```ts
const positions = pptx.layoutGrid({
  items: 6,                    // number of items to position
  columns: 3,                  // items per row (rows auto-calculated)
  area: { x: 0.5, y: 2, w: 12, h: 4 },  // bounding box (inches)
  gap: 0.2,                    // gap between cells (inches, default 0.2)
  gapX?: 0.2,                  // horizontal gap override
  gapY?: 0.3,                  // vertical gap override
  padding?: 0,                 // inner padding per cell (inches)
  align?: 'start' | 'center' | 'stretch',  // horizontal alignment within row
  valign?: 'start' | 'center' | 'stretch', // vertical alignment
})

// Returns: Array<{ x: number, y: number, w: number, h: number }>
```

### Usage

```ts
const grid = pptx.layoutGrid({ items: 6, columns: 3, area: { x: 0.5, y: 2, w: 12, h: 4 }, gap: 0.2 })

grid.forEach((pos, i) => {
  slide.addShape('roundRect', { ...pos, fill: '1a1a24', rectRadius: 0.12 })
  slide.addText(titles[i], { x: pos.x + 0.1, y: pos.y + 0.5, w: pos.w - 0.2, h: 0.5 })
})
```

### Calculation

```
cellW = (area.w - (columns - 1) * gapX) / columns
rows  = Math.ceil(items / columns)
cellH = (area.h - (rows - 1) * gapY) / rows

For item i:
  col = i % columns
  row = Math.floor(i / columns)
  x   = area.x + col * (cellW + gapX)
  y   = area.y + row * (cellH + gapY)
  w   = cellW
  h   = cellH
```

### Edge cases

- `items < columns` → single row, cells still equally sized
- `items = 0` → return empty array
- Last row partial → cells same size, positioned from left (respects `align`)
- `area` with 0 width/height → throw

## Implementation location

- `src/gen-utils.ts` — pure math utility, no OOXML emission
- Export as `layoutGrid` on the PptxGenJS instance (or as a static utility)
- Add to `core-interfaces.ts`: `LayoutGridProps` and `LayoutGridResult`

## Test cases

```ts
// 6 items, 3 columns, 12" wide area with 0.2 gap
const g = layoutGrid({ items: 6, columns: 3, area: { x: 0, y: 0, w: 12, h: 4 }, gap: 0.2 })
assert(g.length === 6)
assert(g[0].x === 0)
assert(g[1].x ≈ 3.93)  // (12 - 0.4) / 3 + 0.2
assert(g[3].y > 0)      // second row
assert(g[5].x === g[2].x) // same column

// 1 item → fills entire area (minus nothing)
const g1 = layoutGrid({ items: 1, columns: 1, area: { x: 1, y: 1, w: 10, h: 5 }, gap: 0 })
assert(g1[0].x === 1 && g1[0].w === 10)
```

## Impact on converter

The `html-to-pptx` skill's `convert-to-pptx.js` currently has ~30 lines of manual
grid math in `renderGrid()` and `renderCapGrid()`. With `layoutGrid()`, these
reduce to a single call + forEach loop.
