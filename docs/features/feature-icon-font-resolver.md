# Feature: Dynamic Icon-Font Resolver — `resolveIconFonts()`

> **Status:** Implemented (v4.3.0)
> **Target:** `@jsamuel1/pptxgenjs/utils`
> **Implemented:** `src/utils/resolve-icon-fonts.ts` (orchestrator; + shared classifier `src/utils/icon-classify.ts` and last-resort glyph map `src/utils/bundled-icons.ts`); exported from `src/utils.ts` (`/utils` subpath); types `types/utils.d.ts` (`resolveIconFonts`, `IconResolveOptions`, `ResolvedSvgPart`); tests `test/feature-icon-font-resolver.test.js`; demo `demos/browser/icon-font-resolver.html`
> **Depends on:** `parseSvg()` (see `feature-svg-normalisation.md`)
> **Priority:** High — replaces the converter's hardcoded `FA_SVG` map with a resolver that works for ANY icon font
> **See also:** `feature-parse-cards-icon-resolution.md` — the synchronous `iconResolver`
> hook on `parseCards()` that this resolver's output (a class→`SvgPart[]` map) can feed.

## Problem

HTML decks render icons with icon **fonts** — Font Awesome (`<i class="fas fa-trophy">`),
Material Icons (`<i class="material-icons">home</i>`), Ionicons, Phosphor, Bootstrap
Icons, or a bespoke project font. In a `.pptx` these must become **vector shapes**
(the icon font is rarely installed in PowerPoint and can't always be embedded — see
`feature-svg-normalisation.md`).

The current `html-to-pptx` converter hard-codes a tiny `FA_SVG` map (a dozen Font
Awesome solid glyphs). That:
- only covers icons someone manually pasted into the converter,
- only covers Font Awesome (not Material/Ionicons/etc.),
- silently drops any icon not in the map.

What's needed is a resolver that, given the HTML (and optionally its stylesheets /
font files), **dynamically** produces vector path data for whatever icon classes the
deck actually uses — for any icon font.

## Proposed API

```ts
import { resolveIconFonts } from '@jsamuel1/pptxgenjs/utils'

const icons: Map<string, SvgPart[]> = await resolveIconFonts(htmlString, {
  stylesheets?: string[],                 // CSS text for content-property extraction
  fontFiles?: { [fontFamily: string]: string }, // local woff2/woff/ttf paths for glyph outlines
  useCdn?: boolean,                        // default true for KNOWN fonts; false disables network
  customResolver?: (className: string, fontFamily: string) => SvgPart[] | null,
  cacheDir?: string,                       // cache CDN-fetched glyphs (default: OS tmp + '/pptx-icon-cache')
  defaultFill?: string,                    // fill handed to parseSvg for the resolved glyph (6-hex)
})

// Key   = the full class string of the icon element, e.g. 'fas fa-trophy'
//         (for Material/ligature fonts, the key also includes the glyph text, e.g.
//          'material-icons|home').
// Value = SvgPart[] (the parseSvg shape) — ready for addCard({ icon: { parts } }).
//         Each part carries a `source` tag noting how it was resolved.
```

```ts
export interface IconResolveOptions {
  stylesheets?: string[]
  fontFiles?: Record<string, string>
  useCdn?: boolean
  customResolver?: (className: string, fontFamily: string) => SvgPart[] | null
  cacheDir?: string
  defaultFill?: string
}

// Each resolved SvgPart is the standard parseSvg() part plus a resolution-source tag,
// so callers/demos can show which method produced it.
export type IconSource = 'css-content' | 'font-file' | 'cdn' | 'bundled' | 'custom'
// SvgPart (from feature-svg-normalisation.md) gains an optional `source?: IconSource`.
```

## Behaviour

### 1. Scan the HTML for icon elements
Find icon nodes by the conventions every icon font uses:
- **Class-token fonts** (FA, Bootstrap Icons, Phosphor, Ionicons): an element whose
  class contains a glyph token — `fa-*`, `bi-*`, `ph-*`, `ion-*`, `icon-*`, etc.
- **Ligature fonts** (Material Icons / Material Symbols): an element whose class is the
  font family (`material-icons`, `material-symbols-outlined`) and whose **text content**
  is the ligature name (`home`, `settings`).

Each found icon yields a `{ className, fontFamily, glyphName, text }` descriptor.

### 2. Resolve each icon to a codepoint, then to vector path data
Resolution is tried in this order (first hit wins); the chosen method is recorded as
the part's `source`:

1. **`customResolver`** — if supplied and it returns parts for the class.
2. **CSS `content` extraction** (`source: 'css-content'`) — parse the supplied
   `stylesheets` (and inline `<style>` blocks in the HTML) for `::before`/`::after`
   rules and map the selector's class to a codepoint:
   ```
   .fa-trophy::before { content: "\f091"; }   ->  fa-trophy = U+F091
   .my-icon::before   { content: "\e900"; }   ->  my-icon   = U+E900
   ```
   For ligature fonts the "codepoint" is the ligature text itself.
3. **Font-file glyph extraction** (`source: 'font-file'`) — if a `fontFiles[family]`
   path is given, parse the woff2/woff/ttf, look up the glyph by codepoint (or by
   ligature for Material), and read its outline as an SVG path, normalised (via the
   same pipeline as `parseSvg`) to absolute `M`/`L`/`C`/`Q`/`Z` on a `0 0 W H` viewBox.
   Uses a bundled minimal OpenType/woff reader (no mandatory third-party dep; if
   `opentype.js` is present it is used).
4. **CDN fetch** (`source: 'cdn'`) — for a KNOWN font registry, fetch the individual
   icon SVG from its CDN and run it through `parseSvg`. Gated on `useCdn` (default
   true) and cached in `cacheDir` (a second call for the same icon is a cache hit, no
   network). Registries:

   | Font | Match | CDN template |
   |------|-------|--------------|
   | Font Awesome 6 Free Solid | `fas` / `fa-solid` + `fa-<name>` | `raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs/solid/<name>.svg` |
   | Font Awesome 6 Free Regular | `far` / `fa-regular` | `…/svgs/regular/<name>.svg` |
   | Font Awesome 6 Brands | `fab` / `fa-brands` | `…/svgs/brands/<name>.svg` |
   | Material Icons / Symbols | `material-icons*` / `material-symbols*` (ligature text) | `fonts.gstatic.com` / `fonts.google.com/icons` SVG export for `<name>` |
   | Ionicons | `ion-<name>` / `ionicon` | `unpkg.com/ionicons/dist/svg/<name>.svg` |
   | Phosphor | `ph-<name>` / `ph` | `unpkg.com/@phosphor-icons/core/assets/<weight>/<name>.svg` |
   | Bootstrap Icons | `bi-<name>` / `bi` | `cdn.jsdelivr.net/npm/bootstrap-icons/icons/<name>.svg` |

5. **Bundled fallback** (`source: 'bundled'`) — a small built-in map (~50–100 of the
   most common icons across FA/Material/Bootstrap) used as a last resort so the
   resolver still returns something useful offline with no stylesheets or font files.

An icon that cannot be resolved by any method is **omitted** from the map (the caller
falls back to its own behaviour); resolution never throws for one bad icon.

### 3. Return a `Map<string, SvgPart[]>`
Keyed by the icon element's class string (Material entries keyed `family|glyph`). The
values drop straight into `addCard({ icon: { parts } })` or are rendered as
`addShape('custGeom', { svgPath })`.

## Implementation location

> **As shipped:** the proposed `src/utils/icon-registries.ts` and `src/utils/woff-glyph.ts`
> split was not created as separate modules; their responsibilities (the known-font
> registry/CDN templates and glyph handling) were consolidated into
> `src/utils/resolve-icon-fonts.ts` together with the bundled fallback map in
> `src/utils/bundled-icons.ts`. The icon-family classifier is shared via
> `src/utils/icon-classify.ts` (used by both `resolveIconFonts()` and `parseCards()`).

- `src/utils/resolve-icon-fonts.ts` — orchestrator: HTML scan → per-icon resolution
  chain → `Map`. Pure logic; the only side effects are optional CDN `fetch` and
  `cacheDir` reads/writes (both gated/optional). Also holds the known-font registry +
  CDN templates (the proposed `icon-registries.ts`) and glyph handling (the proposed
  `woff-glyph.ts`).
- `src/utils/icon-classify.ts` — shared icon-family classifier (`detectIcon`), so
  `resolveIconFonts()` and `parseCards()` recognise icon families identically.
- `src/utils/bundled-icons.ts` — the last-resort common-icon map.
- Re-exported `resolveIconFonts` from `src/utils.ts`; types in `types/utils.d.ts`.
- Reuses `parseSvg()` to normalise every produced path; reuses `GradientFillProps`.

## Test cases

(See `test/feature-icon-font-resolver.test.js`.)

```ts
// FA Solid: class -> vector with the FA 512 viewBox
const m = await resolveIconFonts('<i class="fas fa-trophy"></i>')
const parts = m.get('fas fa-trophy')
assert(parts && parts[0].d.startsWith('M') && parts[0].viewBox.w === 576)

// FA Brands
const b = await resolveIconFonts('<i class="fab fa-github"></i>')
assert(b.get('fab fa-github')[0].d.length > 0)

// Material Icons (ligature text)
const mi = await resolveIconFonts('<i class="material-icons">home</i>')
assert(mi.get('material-icons|home'))

// CSS content extraction from an inline <style>
const css = await resolveIconFonts(
  '<style>.my-icon::before{content:"\\e900"}</style><i class="my-icon iconset"></i>',
  { fontFiles: { iconset: '/path/iconset.ttf' } })
assert(css.get('my-icon iconset')[0].source === 'css-content' || css.get('my-icon iconset')[0].source === 'font-file')

// Custom resolver for an unknown font
const cr = await resolveIconFonts('<i class="acme-logo"></i>', {
  customResolver: (cls) => cls.includes('acme') ? [{ d: 'M0 0L24 0L24 24Z', viewBox: { w: 24, h: 24 }, fill: '000000', mode: 'fill', source: 'custom' }] : null,
})
assert(cr.get('acme-logo')[0].source === 'custom')

// Cache hit: second resolve of the same icon does no network
// Empty/missing icon class -> empty map (no throw)
assert((await resolveIconFonts('<div>no icons</div>')).size === 0)
```

## Impact on converter

Deletes the hardcoded `FA_SVG` / `CHAR_TO_FASVG` map and the `inlineFaIcons()`
helper's reliance on it. The converter becomes:

```js
const { resolveIconFonts, parseCards } = require('@jsamuel1/pptxgenjs/utils')

const icons = await resolveIconFonts(html, { stylesheets: [css], cacheDir: '/tmp/pptx-icon-cache' })
// Feed the resolved map straight into parseCards via the synchronous iconResolver hook
// (see feature-parse-cards-icon-resolution.md) — no HTML pre-inlining needed:
const cards = parseCards(html, { iconResolver: (cls) => icons.get(cls) || null })
cards.forEach((c, i) => slide.addCard({ ...grid[i], ...mapCard(c) }))
```

Now ANY icon font the deck uses renders as crisp vectors — Font Awesome, Material
Icons, Ionicons, Phosphor, Bootstrap Icons, or a custom font with a provided
stylesheet/font file — with no per-icon maintenance in the converter.
