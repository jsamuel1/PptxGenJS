# Feature: addCard() v2 — Icon, Bare-icon, Accent-bar Enhancements

> **Status:** Implemented (v4.1.7) — all five items shipped. Items 1 (font-icon),
> 2 (bare-icon), 3 (per-icon colour), and 4 (accent bar) landed in earlier slices; item 5
> (multi-colour SVG `{ parts }`, consuming `parseSvg()`) now renders each part as its own
> `<a:custGeom>` child with its own resolved fill/gradient/stroke. See
> `feature-card-helper.md` for the base `addCard()`.
> **Target:** `src/gen-objects.ts` (`addCardDefinition`), `src/core-interfaces.ts` (`CardProps`), tests `test/feature-card.test.js`
> **Priority:** Critical — these gaps currently FORCE converters to bypass `addCard()` and hand-compose cards

## Problem

`addCard()` v1 covers the common case but is missing five capabilities that real
decks need, so the `html-to-pptx` converter cannot adopt it and instead hand-rolls
5–8 calls per card:

1. **Font-icon glyphs** — v1 `icon` is only `{ svgPath }` or an emoji string. Font
   Awesome glyphs (`\uf1c4` in `Font Awesome 6 Free Solid`) need `fontFace` control
   or they render as tofu.
2. **Bare icons** — v1 always draws an icon container tile. Many dark-theme grids
   show a bare coloured glyph with no tile (the card itself is the container).
3. **Per-icon colour** — v1 ties the icon tint to `iconFill`; there's no way to set
   the icon colour independent of (or without) a tile.
4. **Left accent bar** — a thin vertical strip on the card's left edge (solid or
   gradient) is a very common card motif; v1 has no API for it.
5. **Multi-colour SVG** — v1 renders one `svgPath` with one fill, flattening
   multi-path / gradient logos to a single colour.

## Proposed API additions

```ts
export interface CardProps extends PositionProps, ObjectNameProps {
  // ...existing v1 fields...

  icon?:
    | { svgPath: { d: string, viewBox: { w: number, h: number } } }   // v1
    | string                                                          // v1 (emoji)
    | { char: string, fontFace: string, color?: HexColor }            // NEW: font icon
    | { parts: SvgPart[] }                                            // NEW: multi-path SVG (parseSvg output)

  iconFill?: HexColor | 'none' | false   // NEW: 'none'/false -> bare icon, no tile
  iconColor?: HexColor                   // NEW: icon accent colour (independent of tile)

  accentBar?: {                          // NEW: thin left-edge bar
    color?: HexColor | GradientFillProps
    width?: number                       // inches, default 0.03
  }
}
```

## Behaviour

- **Font icon** (`icon: { char, fontFace, color }`): emit `addText(char, { fontFace,
  fontSize: derivedFromIconSize, color: color ?? iconColor ?? accent, align:'center',
  valign:'middle' })` at the icon slot. No tile unless `iconFill` is a colour.
- **Bare icon** (`iconFill: 'none' | false`): skip the icon-container `roundRect`;
  draw the icon (svg/font/emoji) directly. Icon colour comes from `iconColor`, the
  font icon's own `color`, or the SVG's own fill.
- **`iconColor`**: tints an SVG-path or emoji/text icon; lets a card show a coloured
  glyph on a bare or neutral tile.
- **Accent bar**: add a thin `rect` (or `roundRect` clipped to the left corners) at
  `x:0, y:0, w:accentBar.width, h:cardH` inside the group, behind the content; accepts
  a solid hex or a `GradientFillProps`.
- **Multi-colour SVG** (`icon: { parts }`): render each `SvgPart` as its own
  `custGeom` child (per-part fill/gradient/stroke), so logos keep their real colours.
  This consumes `parseSvg()` output directly.

Backwards-compatible: all new fields are optional; a v1 `addCard()` call is
byte-identical.

## What it generates (bare icon + accent bar + font icon)

```
┌─┬────────────────────────┐
│▌│        \uf1c4          │  accentBar (left), font glyph icon (no tile)
│▌│                        │
│▌│   HTML Presentations   │  title
│▌│  Decks from a sentence │  description (fit: shrink)
└─┴────────────────────────┘
```

## Implementation location

- `src/core-interfaces.ts` → extend `CardProps` (`icon` union, `iconFill` union,
  `iconColor`, `accentBar`)
- `src/gen-objects.ts` → in `addCardDefinition`: branch the icon renderer on the
  `icon` variant; gate the tile on `iconFill !== 'none' && iconFill !== false`; add
  the accent-bar rect; loop `icon.parts` for multi-path SVG
- No new OOXML primitives — composes existing group children

## Test cases

```ts
// Font icon, bare (no tile), explicit colour
slide.addCard({ x:1, y:1, w:3, h:2.4, title:'Decks',
  icon: { char: '\uf1c4', fontFace: 'Font Awesome 6 Free Solid', color: 'A78BFA' },
  iconFill: 'none' })
// Expected: no icon-container roundRect; one addText glyph in the FA font, colour A78BFA

// Accent bar (gradient) + multi-colour SVG logo
slide.addCard({ x:1, y:1, w:3.5, h:2.5, title:'Quick',
  icon: { parts: parseSvg(logoSvg) },
  accentBar: { color: { type:'gradient', stops:[{position:0,color:'7C3AED'},{position:100,color:'38BDF8'}], direction: 90 }, width: 0.04 } })
// Expected: left gradient rect + N custGeom children (one per logo colour group)

// Per-icon colour without a tile
slide.addCard({ x:1, y:1, w:3, h:2, title:'Build',
  icon: { svgPath: { d:'M3 12h18', viewBox:{w:24,h:24} } },
  iconFill: false, iconColor: '10B981' })
// Expected: bare green icon, no tile
```

## Impact on converter

Unblocks full `addCard()` adoption. With these additions, the converter's
`renderCapGrid()` per-card body (tile + icon branch + title + desc + badge,
~60 lines) becomes a single `slide.addCard({ ...layoutGridCell, ...cardData })`
where `cardData` comes straight from `parseCards()`.
