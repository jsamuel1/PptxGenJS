# Feature Enhancements: Converter-Identified Gaps

> **Status:** Partially Implemented  
> **Created:** 2026-06-08  
> **Progress:** §1 `addCard` enhancements ✅ Implemented (v4.1.7) · §2 `addCallout` enhancements ✅ Implemented (v4.1.7) · §3 theme-extraction equivalence ✅ Implemented (v4.1.7) · §4.1 separator helper ✅ Implemented (v4.1.7) · §4.2 count badge ✅ Implemented (v4.1.7) · parseCards deep CSS-cascade colour follow-up ⏳ remaining  
> **Context:** Gaps identified during `html-to-pptx` skill conversion of a 14-slide scroll-snap presentation. The converter currently bypasses `addCard` and `addCallout` and uses manual shape composition because these APIs lack features needed for faithful HTML→PPTX rendering.  
> **Goal:** Close these gaps so the converter can adopt the native helpers, reducing boilerplate from ~60 lines/card to ~6 lines while maintaining or improving fidelity.  
> **Principle:** Where native library functionality exists and can do the job well, the converter SHOULD adopt it rather than reimplementing with manual shapes. This reduces maintenance surface, ensures OOXML correctness, and means future library improvements automatically benefit all converters.

**Design philosophy:** The converter should be a *thin orchestration layer* that maps HTML structure to library API calls — not a parallel OOXML generation engine. Every feature reimplemented in the converter is a maintenance burden and a divergence risk. The enhancements below close the gaps that currently *force* reimplementation.

---
 
---

## 1. `addCard()` Enhancements

### 1.1 Font Icon Support (Critical)

**Problem:** When `icon` is a string (emoji/text), `addCard` renders it via `addText` with **no `fontFace` control**. Font Awesome glyphs (e.g. `\uf1c4` with `Font Awesome 6 Free Solid`) render as tofu because the system default font lacks those codepoints.

**Proposed change:** Accept a `fontIcon` variant of the `icon` property:

```ts
icon?: 
  | { svgPath: { d: string, viewBox: { w: number, h: number } } }  // SVG path (existing)
  | string                                                           // emoji (existing)
  | { char: string, fontFace: string, color?: HexColor }            // NEW: font icon
```

**Example:**
```js
slide.addCard({
  x: 1, y: 1, w: 3.5, h: 2.5,
  title: 'HTML Presentations',
  icon: { char: '\uf1c4', fontFace: 'Font Awesome 6 Free Solid', color: 'A78BFA' },
  // ...
})
```

**Implementation:** In `addCardDefinition` (gen-objects.ts), when `icon` is an object with `char`+`fontFace`, emit:
```ts
group.addText(icon.char, {
  fontFace: icon.fontFace,
  fontSize: iconFontSize,      // derived from iconSize
  color: icon.color || accent,
  align: 'center', valign: 'middle',
  x: iconX, y: iconY, w: iconSize, h: iconSize,
})
```

### 1.2 Bare Icon Mode — No Background Tile (Critical)

**Problem:** `addCard` always renders an icon container (small rounded rect with `iconFill`). Some designs show icons as bare coloured glyphs with no background tile (common in dark-theme capability grids where the card itself provides the visual container).

**Proposed change:** Allow `iconFill: 'none'` or `iconFill: false` to suppress the icon container:

```ts
/** Icon container background fill. Set 'none' or false to render the icon bare (no tile). */
iconFill?: HexColor | 'none' | false
```

When `iconFill` is `'none'` or `false`:
- Skip the icon container rounded rect entirely
- Render the icon (SVG/font/emoji) directly at the icon position
- The icon colour comes from `icon.color` (font icon), the SVG's own fill, or a new `iconColor` prop

### 1.3 Icon Colour Control (Medium)

**Proposed addition:**
```ts
/** Icon colour (for SVG path fill or emoji text colour). Used when iconFill is 'none'. */
iconColor?: HexColor
```

This gives converters per-card icon accent colours without relying on the fill tile.

### 1.4 Accent Bar (Left Border Highlight) (Medium)

**Problem:** HTML cards often have a left-side accent bar (gradient or solid colour, 3-4px wide). The converter currently draws this manually as a separate shape.

**Proposed addition:**
```ts
/** Left accent bar — a thin vertical strip on the card's left edge. */
accentBar?: {
  color?: HexColor | GradientFillProps   // solid or gradient
  width?: number                         // inches, default 0.03
}
```

**Implementation:** When `accentBar` is defined, add a thin `rect` shape to the group at `x=0, y=0, w=width, h=cardHeight` with `cornerRadius` matching only the top-left/bottom-left corners (or use a full-height rect clipped by the card's rounded background).

### 1.5 Complete Enhanced Interface

```ts
export interface CardProps extends PositionProps, ObjectNameProps {
  title: string
  description?: string
  icon?: 
    | { svgPath: { d: string, viewBox: { w: number, h: number } } }
    | string
    | { char: string, fontFace: string, color?: HexColor }  // NEW
  badge?: CardBadgeProps
  fill?: ShapeFillProps | GradientFillProps | PatternFillProps | ImageFillProps | HexColor
  border?: { color?: HexColor, width?: number }
  cornerRadius?: number
  shadow?: ShadowProps
  glow?: TextGlowProps
  titleFont?: CardFontProps
  descFont?: CardFontProps
  iconSize?: number
  iconFill?: HexColor | 'none' | false     // NEW: bare icon mode
  iconColor?: HexColor                      // NEW: icon accent colour
  accentBar?: { color?: HexColor | GradientFillProps, width?: number }  // NEW
  align?: 'center' | 'left'
  iconPosition?: 'top' | 'left'
  animation?: AnimationProps
}
```

---

## 2. `addCallout()` Enhancements

### 2.1 Current Limitation

The current `addCallout` renders a single centred text run in a rounded rect. It cannot represent:
- **Left-aligned** text with an accent bar (quote blocks)
- **Italic** styling (for blockquotes)
- **Attribution line** (smaller, muted text below the quote)
- **Multi-run text** (e.g. bold keyword + normal description)

### 2.2 Proposed Additions

```ts
export interface CalloutProps extends PositionProps, ObjectNameProps {
  text: string | TextProps[]               // ENHANCED: accept multi-run text array
  attribution?: string                     // NEW: attribution/source line below main text
  fill?: ShapeFillProps | GradientFillProps | PatternFillProps | ImageFillProps | HexColor
  fontColor?: HexColor
  fontSize?: number
  fontFace?: string                        // NEW: font family control
  fontBold?: boolean
  fontItalic?: boolean                     // NEW: italic support
  cornerRadius?: number
  align?: HAlign                           // existing, but make 'left' work properly
  valign?: VAlign
  accentBar?: {                            // NEW: left accent bar
    color?: HexColor | GradientFillProps
    width?: number                         // inches, default 0.03
  }
  attributionFont?: {                      // NEW: styling for attribution line
    size?: number
    color?: HexColor
    italic?: boolean
  }
  padding?: number | { l?: number, r?: number, t?: number, b?: number }  // NEW: inner padding
}
```

### 2.3 Example Usage (Quote Block)

```js
slide.addCallout({
  x: 1, y: 5, w: 8, h: 1.2,
  text: 'The dispatcher is the game changer — it turns Quick from a chatbot into an operating system.',
  attribution: '— Internal power user feedback',
  fill: '1E1A2B',
  fontColor: 'D4D0DE',
  fontItalic: true,
  fontSize: 12,
  align: 'left',
  accentBar: { color: '7C3AED', width: 0.03 },
  cornerRadius: 0.1,
  attributionFont: { size: 9, color: '64748B' },
  padding: { l: 0.25, r: 0.2, t: 0.15, b: 0.15 },
})
```

### 2.4 Implementation Notes

When `accentBar` is present:
- The callout becomes a group (`addGroup`) containing:
  1. Background rounded rect
  2. Accent bar rect (tall, narrow, left edge)
  3. Main text box (offset right by `accentBar.width + padding.l`)
  4. Attribution text box (below main text, smaller/muted)

When `accentBar` is absent (current behaviour preserved):
- Single rounded rect with centred text (backwards compatible)

---

## 3. Theme Extraction Utility — Equivalence with Converter

> **§3 Status:** ✅ Implemented (v4.1.7). `extractThemeFromCSS` now parses `rgb()`/`rgba()`, resolves
> `var(--name)` refs, computes derived colours (`cardLine`/`cardFill`/`barStops`), extracts the
> extended palette (`bgMid`/`bgLight`/`bgDeep`/`coral`/`gray100/300/500`), supports `forcePreset`, and
> attaches `presetName`/`vars` metadata. The new options (`forcePreset`, `derivedColors`,
> `resolveVarRefs`, `parseRgb`, `barGradientVar`) and palette fields are additive and default-on.
> See `docs/feature-theme-extraction.md` for the full reference.

### 3.1 Current Gap

The `extractThemeFromCSS` utility (in `src/utils/extract-theme.ts`) maps CSS variables to a flat `ThemePalette`. However, the converter's `buildTheme()` does significantly more:

| Feature | `extractThemeFromCSS` | Converter's `buildTheme` |
|---------|----------------------|--------------------------|
| Parse `:root` vars | ✅ | ✅ |
| Preset fallbacks (dark/navy/charcoal/light) | ✅ | ✅ |
| `var()` resolution in inline styles | ❌ | ✅ |
| Forced preset override with validation | ❌ | ✅ |
| **Derived colours** (cardLine, card blend) | ❌ | ✅ `mix(purple, bg, 0.72)` |
| **Gradient bar stops** from `--bar-gradient` | ❌ | ✅ `deriveBarStops()` |
| **rgb()/rgba() parsing** | ❌ (noted as limitation) | ✅ |
| **Named colour map** (common CSS names) | ❌ | ✅ |
| **Extended palette** (coral, bgDeep, bgMid, bgLight) | Partial | ✅ |
| **Font extraction** (first family from comma list) | ❌ (returns full string) | ✅ `.split(',')[0].trim()` |

### 3.2 Proposed Enhancements to `extractThemeFromCSS`

```ts
export interface ExtractThemeOptions {
  presets?: Record<string, Record<string, string>>
  defaultPreset?: string
  forcePreset?: string                    // NEW: bypass extraction, use preset only
  derivedColors?: boolean                 // NEW: compute cardLine, card blends (default true)
  resolveVarRefs?: boolean                // NEW: resolve var(--name) in values (default true)
  parseRgb?: boolean                      // NEW: convert rgb()/rgba() to hex (default true)
  barGradientVar?: string                 // NEW: CSS var name for gradient bar (default '--bar-gradient')
}

export interface ThemePalette {
  // Core (existing)
  bg: string
  bgSecondary: string
  accent: string
  accentSoft: string
  text: string
  textSecondary: string
  font: string
  sky: string
  green: string
  orange: string
  red: string
  
  // Extended (NEW — equivalence with converter)
  bgMid: string              // mid-tone background
  bgLight: string            // lighter background (card hover states)
  bgDeep: string             // deepest background
  coral: string              // secondary accent
  gray100: string            // light gray text
  gray300: string            // medium gray (descriptions)
  gray500: string            // muted gray (footers, timestamps)
  
  // Derived (NEW — computed, not extracted)
  cardLine: string           // subtle card border: mix(accent, bg, 0.72)
  cardFill: string           // card background: mix(bgMid, bg, 0.4)
  barStops: string[]         // gradient bar: derived from --bar-gradient or [accent, accentSoft, sky]
  
  // Metadata
  presetName: string         // which preset was used (or 'extracted')
  vars: Record<string, string>  // raw CSS vars for downstream var() resolution
}
```

### 3.3 Implementation Additions

In `src/utils/extract-theme.ts`:

```ts
// 1. rgb()/rgba() parser
function rgbToHex(value: string): string | null {
  const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return null
  return [m[1], m[2], m[3]].map(n => parseInt(n).toString(16).padStart(2, '0')).join('')
}

// 2. var() resolver
function resolveVar(value: string, vars: Record<string, string>): string {
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => vars[name] || '')
}

// 3. Colour mixing (same as converter's `mix`)
function mixColors(a: string, b: string, weight: number): string {
  const pa = a.match(/.{2}/g)!.map(h => parseInt(h, 16))
  const pb = b.match(/.{2}/g)!.map(h => parseInt(h, 16))
  return pa.map((v, i) => Math.round(v * (1 - weight) + pb[i] * weight).toString(16).padStart(2, '0')).join('')
}

// 4. Bar gradient derivation
function deriveBarStops(vars: Record<string, string>, palette: Partial<ThemePalette>): string[] {
  const barVar = vars['--bar-gradient'] || ''
  // Parse var() refs in the gradient: linear-gradient(90deg, var(--purple), var(--purple-soft), var(--sky))
  const refs = [...barVar.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1])
  if (refs.length >= 2) {
    return refs.map(r => resolveColor(vars[r] || '', vars)).filter(Boolean)
  }
  return [palette.accent || '7C3AED', palette.accentSoft || 'A78BFA', palette.sky || '38BDF8']
}

// 5. Font family extraction (first from comma-separated list)
function extractFont(value: string): string {
  return value.replace(/['\"]/g, '').split(',')[0].trim() || 'Inter'
}
```

### 3.4 Equivalence Test

After enhancement, the following should produce identical results:

```ts
// Library utility:
import { extractThemeFromCSS } from '@jsamuel1/pptxgenjs/utils'
const theme = extractThemeFromCSS(cssString, { derivedColors: true, parseRgb: true })

// Converter's buildTheme:
const theme2 = buildTheme(cssString, null)

// Assertions:
assert(theme.bg === theme2.bg)
assert(theme.cardLine === theme2.cardLine)
assert(theme.barStops.join(',') === theme2.barStops.join(','))
assert(theme.font === theme2.font)
```

### 3.5 Migration Path for Converter

Once equivalence is confirmed:
```js
// Before (50 lines):
function parseRootVars(css) { ... }
function buildTheme(css, forcedPreset) { ... }
function mix(a, b, w) { ... }
function deriveBarStops(vars, theme) { ... }
const theme = buildTheme(cssFromHtml, argv.theme)

// After (2 lines):
const { extractThemeFromCSS } = require('@jsamuel1/pptxgenjs/utils')
const theme = extractThemeFromCSS(cssFromHtml, { forcePreset: argv.theme, derivedColors: true })
```

---

## 4. Native API Adoption (No Enhancement Needed — Converter Migration)

These are features the library ALREADY provides natively. The converter should migrate to them — no library changes required.

### 4.1 Header/Footer (`headerFooter` config)

**Current state:** The converter manually places text boxes for:
- Author/role line (bottom-left footer on all slides)
- Slide number (bottom-right)
- Copyright line (bottom-centre)

This is done via `baseChrome()` which adds 3 text boxes per slide with absolute positioning.

**Native API available:**
```js
pptx.headerFooter = {
  slideNumber: { position: 'bottom-right' },
  footer: { text: 'Joshua Samuel · AWS AIML Solutions Architect · June 2026' },
  dateTime: false,
}
```

**Migration:** Replace `baseChrome()` footer/slideNum/copyright logic with the native `headerFooter` config. Benefits:
- Correct OOXML placeholder semantics (PowerPoint recognises these as footer/page-number fields)
- Automatic repositioning when slide layout changes
- User-editable via PowerPoint's Insert > Header & Footer dialog
- Consistent numbering even when slides are reordered

**Converter action:** Adopt `pptx.headerFooter` for footer text and slide numbers. Copyright (if distinct from footer) may still need a manual text box if the native API only supports one footer line.

### 4.2 `addGroup()` (Already Adopted ✅)

Used for mockup panels. No change needed.

### 4.3 `layoutGrid()` (Already Adopted ✅)

Used for capGrid cell positioning. No change needed.

### 4.4 Animation `group`/`stagger` Sugar (Adopt When Stable)

**Current state:** The converter uses a custom `makeSequencer()` that tracks `.dN` delay classes and emits `afterPrevious`/`withPrevious` triggers.

**Native API available:** The fork supports `animation: { group: N, stagger: ms }` which handles the grouping natively.

**Migration plan:** Once the animation sugar is confirmed stable and produces byte-identical timing XML to the current sequencer output, migrate to it. This eliminates ~40 lines of sequencer logic and makes the intent clearer:
```js
slide.addCard({ ..., animation: { type: 'fadeIn', group: 3, stagger: 100 } })
// vs current: seq(el, slide, shape, { type: 'fadeIn' })
```

**Blocker:** Verify the `group`/`stagger` API produces equivalent `<p:timing>` XML to the current sequencer. If it does, adopt immediately.

---

## 4. Additional Small Enhancements

### 4.1 Separator Line Helper (Low Priority)

> **§4.1 Status:** ✅ Implemented (v4.1.7). `slide.addSeparator(...)` (and `group.addSeparator(...)`)
> draws a thin rule as a single `rect` — a pure composition of the existing shape primitive, no new
> OOXML and no new dependency. `opacity` (0–1) maps to the rect fill transparency
> (`transparency = round((1 - opacity) × 100)`), `thickness` is the rule's short dimension (inches),
> and `orientation` (`'horizontal'` default | `'vertical'`) decides whether `w` or `h` spans. Degenerate
> `thickness`/`opacity` clamp to defaults (never throws). See `docs/feature-card-helper.md` siblings
> (`addAvatar`/`addBadge`) for the same composition pattern.

Currently the converter draws thin rectangles for horizontal separators. A dedicated helper could standardise this:

```ts
slide.addSeparator({
  x: 1, y: 3, w: 4,
  color?: HexColor,        // default: 'D4D4D8' (theme gray)
  thickness?: number,      // inches, default 0.01
  opacity?: number,        // 0-1, default 0.5
  orientation?: 'horizontal' | 'vertical',  // default 'horizontal'
})
```

### 4.2 Notification Badge on `addCard` (Low Priority)

The existing `badge` is positioned top-right and is designed for labels like "NEW" or "ACTIVE". A **count badge** (small circle with a number, right-aligned on a specific line) would serve notification indicators:

```ts
badge?: CardBadgeProps | {
  type: 'count',
  value: number,
  fill?: HexColor,        // default: accent
  position?: 'top-right' | 'inline-right'  // NEW: inline-right for nav items
}
```

✅ **Implemented (v4.1.7).** `addCard`'s `badge` now accepts a count-bubble variant
`{ type: 'count', value, fill?, color?, position? }`. It draws a small circle (OVAL → `prst="ellipse"`)
with the count centred inside — `'top-right'` (default) or `'inline-right'` (vertically centred on the
card's right edge, for nav/sidebar items). Pure composition of existing primitives (no new OOXML, no new
dependency). Non-finite `value` renders `'0'` (never throws). The existing `{ text }` text-pill path is
byte-identical (the count branch fires only on `badge.type === 'count'`).

---

## 5. Implementation & Adoption Priority

| Enhancement | Priority | Impact | Effort |
|-------------|----------|--------|--------|
| Font icon support in `addCard` | 🔴 Critical | Enables FA glyph cards without manual composition | Small |
| Bare icon mode (`iconFill: 'none'`) | 🔴 Critical | Enables dark-theme bare-glyph aesthetic | Small |
| Theme extraction equivalence | 🟡 Medium | Reduces converter by 50 lines, ensures consistency | Medium |
| Callout accent bar + attribution | 🟡 Medium | Enables quote blocks via native API | Medium |
| Header/footer migration | 🟡 Medium | Correct OOXML semantics, user-editable in PPT | Small (converter-only) |
| Icon colour control | 🟢 Low | Per-card accent without fill tile | Tiny |
| Card accent bar | 🟢 Low | Reduces manual shape for left-bar cards | Small |
| Separator helper | 🟢 Low | Convenience, not blocking | Tiny |
| Count badge variant | 🟢 Low | Niche (sidebar mockups) | Small |

---

## 6. Converter Adoption Plan

Once the critical enhancements ship:

1. **Phase 1** (after font icon + bare icon mode): Refactor `renderCapGrid` to use `addCard` + `layoutGrid` for all grid slides (3, 9, 13). ~60 lines/card → 6 lines.
2. **Phase 2** (after callout enhancement): Replace manual quote/callout rendering with `addCallout({ accentBar, attribution })`.
3. **Phase 3** (after theme equivalence): Replace `parseRootVars`/`buildTheme`/`mix`/`deriveBarStops` with `extractThemeFromCSS()`.
4. **Phase 4** (no library change needed): Migrate `baseChrome()` footer/slideNum/copyright to native `headerFooter` config. Migrate animation sequencer to `group`/`stagger` sugar once verified equivalent.

Each phase is independently shippable and testable.
