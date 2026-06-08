# Feature: Theme Extraction from HTML/CSS

> **Status:** Implemented (v4.2.0)  
> **Priority:** Medium — currently done in the converter; could be a reusable utility  
> **Implemented:** `src/utils/extract-theme.ts` (`extractThemeFromCSS`, `ThemePalette`/`ExtractThemeOptions`); optional entry `src/utils.ts` → `package.json` `exports["./utils"]` (`@jsamuel1/pptxgenjs/utils`); tests `test/feature-theme-extraction.test.js`. Decision: shipped as an **optional `/utils` subpath**, NOT a method on the core `PptxGenJS` class — keeping the core library focused on OOXML generation (matches this spec's recommendation and the CHANGELOG note).

## Problem

When converting HTML to PPTX, the converter must extract the visual theme
(background colour, accent, text colours, font) from the source HTML. This logic
is currently embedded in the `html-to-pptx` converter script and isn't reusable
by other tools.

## Question: Should this be in PptxGenJS?

**Arguments for:**
- Any HTML-to-PPTX pipeline needs theme extraction
- The utility is format-agnostic (CSS parsing → colour palette)
- Could also be useful for applying a theme from one PPTX to another

**Arguments against:**
- PptxGenJS is an OOXML generator, not an HTML parser
- Theme extraction requires CSS knowledge (`:root` vars, computed styles)
- Different source formats (HTML, Figma, Sketch) have different theme locations

## Recommended: Utility module (not core API)

Provide as `pptxgenjs/utils/extractTheme` — an optional import, not on the main
class. Keeps the library focused while offering the utility to converters.

## Proposed API

```ts
import { extractThemeFromCSS } from '@jsamuel1/pptxgenjs/utils'

const theme = extractThemeFromCSS(cssString, {
  presets: { dark: {...}, light: {...} },  // fallback presets
  defaultPreset: 'dark'
})

// Returns:
{
  bg: '121218',           // background colour (hex, no #)
  bgSecondary: '1a1a24', // card/surface colour
  accent: '7C3AED',      // primary accent
  accentSoft: 'A78BFA',  // lighter accent
  text: 'E4E4ED',        // primary text
  textSecondary: '8A8A9A', // muted text
  font: 'Inter',         // font family
  // Extended palette:
  sky: '38BDF8',
  green: '10B981',
  orange: 'FF9900',
  red: 'EF4444',
}
```

## Extraction logic

1. Parse `:root { --var-name: value; }` blocks
2. Map known CSS variable patterns to theme slots:
   - `--color-bg`, `--bg`, `--background` → `bg`
   - `--color-primary`, `--accent`, `--purple` → `accent`
   - `--color-text`, `--text`, `--foreground` → `text`
   - `--font`, `--font-family` → `font`
3. If no `:root` vars found, extract from inline styles on body/section elements
4. Fall back to preset if nothing extracted

## CSS variable mapping table

| CSS variable pattern | Theme slot |
|---------------------|-----------|
| `--bg`, `--color-bg`, `--background`, `--bg-deep` | `bg` |
| `--bg-card`, `--card`, `--color-bg-secondary`, `--bg-surface` | `bgSecondary` |
| `--purple`, `--accent`, `--color-primary`, `--primary` | `accent` |
| `--purple-soft`, `--accent-soft`, `--color-primary-light` | `accentSoft` |
| `--white`, `--text`, `--color-text`, `--foreground` | `text` |
| `--gray`, `--muted`, `--color-text-secondary` | `textSecondary` |
| `--sky`, `--blue`, `--info` | `sky` |
| `--green`, `--success` | `green` |
| `--orange`, `--warning` | `orange` |
| `--red`, `--error`, `--danger` | `red` |
| `--font`, `--font-family` | `font` |

## Implementation location

- `src/utils/extract-theme.ts` — new utility file
- Export from package entry: `import { extractThemeFromCSS } from '@jsamuel1/pptxgenjs/utils'`
- No DOM dependency (works in Node.js, uses regex CSS parsing)
- Add to `package.json` exports: `"./utils": "./dist/utils.js"`

## Limitations

- Regex-based CSS parsing won't handle nested `@media` blocks or `@import`
- Only extracts from CSS text, not computed styles (no browser required)
- Hex and `rgb()`/`rgba()` colours are converted to hex; `hsl()` and named colours are returned as-is

## v2 — converter-equivalence (v4.1.7)

`extractThemeFromCSS` reproduces the html-to-pptx converter's `buildTheme()`. The following are
additive and default-on, so existing hex-input extraction is unchanged.

New `ExtractThemeOptions`:

```ts
interface ExtractThemeOptions {
  presets?: Record<string, Partial<ThemePalette>>
  defaultPreset?: string
  forcePreset?: string       // bypass CSS, use this preset only; unknown name → defaultPreset (no throw)
  derivedColors?: boolean    // compute cardLine/cardFill/barStops (@default true)
  resolveVarRefs?: boolean   // resolve var(--name) in values (@default true)
  parseRgb?: boolean         // convert rgb()/rgba() → hex (@default true)
  barGradientVar?: string    // var name for the gradient bar (@default '--bar-gradient')
}
```

New `ThemePalette` fields:

- **Extended (extracted, preset-defaulted):** `bgMid`, `bgLight`, `bgDeep`, `coral`, `gray100`, `gray300`, `gray500` (mapped from `--bg-mid`, `--bg-light`/`--bg-hover`, `--bg-deep`, `--coral`/`--secondary-accent`, `--gray-100/300/500`).
- **Derived (computed when `derivedColors`):** `cardLine = mix(accent, bg, 0.72)`, `cardFill = mix(bgMid, bg, 0.4)`, `barStops: string[]` (from `--bar-gradient` `var()` refs when ≥2, else `[accent, accentSoft, sky]`).
- **Metadata:** `presetName` (`'extracted'` when ≥1 var matched, a preset name when `forcePreset` is used, else the fallback) and `vars` (the raw parsed `--name: value` map, bare-name keyed).

```ts
const theme = extractThemeFromCSS(css, { forcePreset: argv.theme, derivedColors: true })
// theme.cardLine, theme.barStops, theme.bgMid, theme.presetName, theme.vars now populated
```

> Note: `--bg-deep` now maps to the dedicated `bgDeep` slot (previously aliased to `bg`).

## Test cases

```ts
const css = `:root {
  --bg: #121218;
  --purple: #7C3AED;
  --white: #E4E4ED;
  --font: 'Inter';
}`

const theme = extractThemeFromCSS(css)
assert(theme.bg === '121218')
assert(theme.accent === '7C3AED')
assert(theme.text === 'E4E4ED')
assert(theme.font === 'Inter')

// Empty CSS → fallback to preset
const empty = extractThemeFromCSS('', { defaultPreset: 'dark' })
assert(empty.bg === '121218')  // from dark preset
```

## Impact on converter

The `html-to-pptx` converter's `parseRootVars()` + `buildTheme()` (~50 lines)
becomes:
```js
const { extractThemeFromCSS } = require('@jsamuel1/pptxgenjs/utils')
const theme = extractThemeFromCSS(cssFromHtml)
```

One line replaces 50.
