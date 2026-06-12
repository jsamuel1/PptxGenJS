# Feature: Resolve Font-Icon Glyphs in `parseCards()` (stop dropping card icons)

> **Status:** Implemented (Unreleased)
> **Target:** `@jsamuel1/pptxgenjs/utils` (next minor — 4.3.0)
> **Implemented:** `src/utils/parse-cards.ts` + shared classifier `src/utils/icon-classify.ts`; types `types/utils.d.ts` (`CardData`, `ParseCardsOptions`); tests `test/feature-parse-cards.test.js`
> **Depends on:** `parseSvg()` (`feature-svg-normalisation.md`), and dovetails with `resolveIconFonts()` (`feature-icon-font-resolver.md`)
> **Priority:** High — without this, every Font-Awesome (and other icon-font) card icon is silently lost by `parseCards()`, forcing each consumer to pre-process the HTML before calling the library

## Problem

`parseCards()` advertises structure-driven icon detection (see
`feature-parse-card-structure.md`), and its detection algorithm explicitly says the
icon step should, for an `<i class="fa-*">`, produce a `fontIcon` **"and, if a vector
path map is available, prefer `{ type:'svg', parts }`."** Neither half of that is
true in the shipped code.

In `src/utils/parse-cards.ts`, `analyzeCard()` does this for a font-icon element:

```ts
const faEl = findFirst(card, e => (e.tag === 'i' || e.tag === 'span') && e.classes.some(isFaClass))
if (faEl) {
    iconEl = faEl
    skip.add(faEl)
    icon = { type: 'fontIcon', char: '', fontFace: 'Font Awesome 6 Free' }   // ← glyph identity discarded
}
```

The resulting `CardData.icon` is `{ type: 'fontIcon', char: '', fontFace: 'Font Awesome 6 Free' }`:

- **`char` is empty** — the actual codepoint is never resolved (it lives in the Font
  Awesome stylesheet's `.fa-users::before { content: "\f0c0" }` rule, which
  `analyzeCard` does not consult).
- **The class / glyph name is not preserved** — the descriptor keeps no record that
  the icon was `fa-users` (vs `fa-code`), so a downstream caller cannot recover it
  either. `iconEl` is tracked internally for colour extraction, but the glyph name
  never reaches `CardData`.
- There is **no hook** for a caller to supply a class→vector map, despite the
  documented "if a vector path map is available, prefer svg" behaviour and despite
  `feature-icon-font-resolver.md` describing feeding a resolver map "to a parseCards
  icon hook." That hook does not exist.

### Observed impact (downstream)

The `html-to-pptx` converter cannot rely on `parseCards()` for icons. It works around
the gap by **pre-rewriting the HTML before calling `parseCards()`** — an
`inlineFaIcons()` helper walks the slide, looks up each `fa-*` class in a local
`FA_SVG` glyph map, and replaces the `<i>` with an inline `<svg fill="#…">` so that
`parseCards()` takes its `type:'svg'` branch instead. It additionally keeps a reverse
`CHAR_TO_FASVG` map and a `faVectorParts()` helper to patch up any `fontIcon` that
slips through (`cardDataToProps`). All of this exists **only because `parseCards()`
returns an empty `fontIcon`.** A correct library would let the converter call
`parseCards(html)` directly and get usable icon data.

This is the root cause of the converter's `inlineFaIcons()` pre-processing pass and
its duplicated FA glyph maps.

## Goals

1. `parseCards()` must **never silently lose** a card's icon identity. A detected
   font-icon element must carry enough information for a consumer to render it.
2. Provide a **synchronous resolver hook** so a caller (or a bundled map) can turn a
   font-icon class into real vector parts **during** card parsing — fulfilling the
   already-documented "prefer `{ type:'svg', parts }`" behaviour.
3. Stay **pure and dependency-free and synchronous.** `parseCards()` is synchronous
   and string-only by contract; this change must not introduce `async`, network, or
   `fs`. (Network/font-file resolution remains the job of the async
   `resolveIconFonts()`.)
4. **Backwards compatible.** Existing callers that read `icon.type === 'fontIcon'`
   keep working; the `fontIcon` shape is only *extended*, never broken.

## Non-goals

- Resolving codepoints from font files or CDNs inside `parseCards()` (that is
  `resolveIconFonts()`’s async job — see `feature-icon-font-resolver.md`).
- A full CSS cascade. Class→codepoint extraction from inline `<style>` `::before`
  rules is in scope as an *optional* enhancement (see §3); computed-style specificity
  is not.

## Design

### 1. Preserve the glyph identity on the `fontIcon` descriptor

Extend the `fontIcon` variant of `CardData.icon` with the glyph name and full class
string. Both fields are additive; `char` stays for compatibility.

```ts
// types/utils.d.ts and src/utils/parse-cards.ts
icon?:
    | { type: 'svg', parts: SvgPart[] }
    | {
        type: 'fontIcon'
        /** Resolved glyph codepoint as a string, or '' when only the class is known. */
        char: string
        /** PowerPoint font family to render the glyph with. */
        fontFace: string
        /** NEW: glyph token without the family prefix, e.g. 'users' for `fa-users`. */
        glyphName?: string
        /** NEW: the icon element's full class string, e.g. 'fas fa-users'. */
        className?: string
        /** NEW: detected icon-font family key: 'fa' | 'bi' | 'ph' | 'ion' | 'material' | string. */
        fontFamily?: string
      }
    | { type: 'emoji', text: string }
```

`analyzeCard()` populates `glyphName`/`className`/`fontFamily` from the matched icon
element. Reuse the existing `detectIcon()` classifier from `resolve-icon-fonts.ts`
(it already turns a class string into `{ fontFamily, glyphName, className }`) rather
than duplicating the parsing, so FA/Bootstrap/Phosphor/Ionicons families are all
recognised consistently across the two utilities. Map the family to a sensible
default `fontFace` (e.g. `fa` solid → `'Font Awesome 6 Free Solid'`, brands →
`'Font Awesome 6 Brands'`).

### 2. Add a synchronous `iconResolver` hook to `ParseCardsOptions`

```ts
// types/utils.d.ts and src/utils/parse-cards.ts
export interface ParseCardsOptions {
    containerPattern?: RegExp
    cardPattern?: RegExp
    excludeWithin?: RegExp
    defaultFill?: string
    /**
     * NEW. Optional SYNCHRONOUS resolver from an icon-element class string to vector parts.
     * When it returns a non-empty array for a card's font-icon, `parseCards` emits
     * `{ type: 'svg', parts }` instead of `{ type: 'fontIcon', … }`, so the card renders as a
     * crisp custGeom vector with no icon font installed. Returning `null`/`[]` falls back to the
     * (now glyph-aware) `fontIcon` descriptor. Must be sync — `parseCards` stays synchronous.
     */
    iconResolver?: (className: string, fontFamily: string, glyphName: string) => SvgPart[] | null
}
```

`analyzeCard()` icon step becomes:

```ts
} else {
    const faEl = findFirst(card, e => (e.tag === 'i' || e.tag === 'span') && e.classes.some(isFaClass))
    if (faEl) {
        iconEl = faEl
        skip.add(faEl)
        const desc = detectIcon(faEl.classes.join(' '), textOf(faEl))   // { fontFamily, glyphName, className }
        const parts = opts.iconResolver?.(desc.className, desc.fontFamily, desc.glyphName) ?? null
        if (parts && parts.length) {
            icon = { type: 'svg', parts }                                // ← resolved to a vector
        } else {
            icon = {
                type: 'fontIcon',
                char: codepointFor(desc) ?? '',                          // see §3 (optional)
                fontFace: fontFaceFor(desc.fontFamily, faEl.classes),
                glyphName: desc.glyphName,
                className: desc.className,
                fontFamily: desc.fontFamily,
            }
        }
    }
}
```

This is exactly the "parseCards icon hook" referenced by
`feature-icon-font-resolver.md`. A consumer that has a class→`SvgPart[]` map (whether
the converter's bundled `FA_SVG`, or the output of an earlier `resolveIconFonts()`
call) passes it as `iconResolver` and gets fully-resolved card icons in one
synchronous `parseCards()` call — no HTML pre-processing.

### 3. (Optional, same change) Class→codepoint from inline `<style>`

`parseCards()` already extracts a `<style>`/`:root` context (`parseStyleSheets`) for
colour resolution. Where that context contains an icon `::before { content: "\fXXX" }`
rule for the matched class, populate `fontIcon.char` with the unescaped codepoint
(reusing `extractCssCodepoints()` from `resolve-icon-fonts.ts`). This makes the
non-resolver path useful too: a `fontIcon` with a real `char` + `fontFace` renders as
a glyph when the FA font is embedded/installed, instead of as nothing. Purely
additive; when no such rule exists, `char` stays `''` as today.

## Backwards compatibility

- The `fontIcon` object only gains optional fields; `char` and `fontFace` are
  unchanged. Existing `icon.type === 'fontIcon'` consumers are unaffected.
- `iconResolver` is optional; omitting it reproduces today's behaviour **except**
  that `fontIcon` now also carries `glyphName`/`className`/`fontFamily` (strictly more
  information, never less).
- No signature, sync/async, or dependency change to `parseCards()`.

## Test cases

Add to `test/feature-parse-cards.test.js`:

```js
const { parseCards } = require('@jsamuel1/pptxgenjs/utils')

// 1) Glyph identity is preserved (was the bug: char:'' AND no class kept)
const fa = parseCards('<div class="grid">' +
  '<div class="card"><i class="fas fa-users"></i><div class="title">Team</div></div>' +
  '<div class="card"><i class="fas fa-code"></i><b>Build</b></div></div>')
assert(fa[0].icon.type === 'fontIcon')
assert(fa[0].icon.glyphName === 'users')
assert(fa[0].icon.className === 'fas fa-users')
assert(fa[0].icon.fontFamily === 'fa')
assert(fa[1].icon.glyphName === 'code')          // distinguishable from card 0 — was impossible before

// 2) iconResolver upgrades fontIcon -> svg
const MAP = {
  'fa-users': [{ d: 'M0 0L10 0L10 10Z', viewBox: { w: 512, h: 512 }, fill: '7C3AED', mode: 'fill' }],
}
const res = parseCards('<div class="grid">' +
  '<div class="card"><i class="fas fa-users"></i><div class="title">Team</div></div>' +
  '<div class="card"><i class="fas fa-code"></i><div class="title">Build</div></div></div>',
  { iconResolver: (cls, fam, glyph) => MAP['fa-' + glyph] || null })
assert(res[0].icon.type === 'svg' && res[0].icon.parts[0].d.startsWith('M'))  // resolved
assert(res[1].icon.type === 'fontIcon' && res[1].icon.glyphName === 'code')   // unresolved -> glyph-aware fallback

// 3) iconResolver returning null/[] falls back cleanly (no throw)
const none = parseCards('<div class="grid">' +
  '<div class="card"><i class="fas fa-ghost"></i><div class="title">A</div></div>' +
  '<div class="card"><i class="fas fa-ghost"></i><div class="title">B</div></div></div>',
  { iconResolver: () => null })
assert(none[0].icon.type === 'fontIcon')

// 4) Inline <style> ::before content -> codepoint on char (optional §3)
const cp = parseCards('<style>.fa-users::before{content:"\\f0c0"}</style><div class="grid">' +
  '<div class="card"><i class="fas fa-users"></i><div class="title">A</div></div>' +
  '<div class="card"><i class="fas fa-users"></i><div class="title">B</div></div></div>')
assert(cp[0].icon.type === 'fontIcon' && (cp[0].icon.char === '\uf0c0' || cp[0].icon.char === ''))

// 5) Inline <svg> still wins over a font icon (unchanged precedence)
const svg = parseCards('<div class="grid">' +
  '<div class="card"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><i class="fas fa-users"></i><div class="title">A</div></div>' +
  '<div class="card"><div class="title">B</div></div></div>')
assert(svg[0].icon.type === 'svg')
```

## Implementation checklist

- `src/utils/parse-cards.ts`
  - Import/reuse `detectIcon` + `extractCssCodepoints` from `resolve-icon-fonts.ts`
    (or extract them to a shared `icon-classify.ts` consumed by both — preferred, so
    the two utilities cannot drift).
  - Rewrite the `analyzeCard()` font-icon branch per §1–§3.
  - Add `iconResolver` to `ParseCardsOptions` and thread `opts` through (already
    passed to `analyzeCard`).
  - Add a `fontFaceFor(family, classes)` helper (fa solid/regular/brands → the three
    "Font Awesome 6 Free *" / "Font Awesome 6 Brands" families).
- `types/utils.d.ts` — extend the `fontIcon` union member and `ParseCardsOptions`
  exactly as above.
- `test/feature-parse-cards.test.js` — add cases 1–5.
- Docs:
  - Update `feature-parse-card-structure.md`’s detection algorithm + `CardData` to
    reflect the now-real "prefer svg via `iconResolver`" path and the extended
    `fontIcon` shape.
  - Cross-link from `feature-icon-font-resolver.md` (its "feed the map to a parseCards
    icon hook" sentence now points at a concrete `iconResolver` option).

## Impact on the `html-to-pptx` converter (the consumer that hit this)

Once shipped, the converter can:

```js
const { parseCards } = require('@jsamuel1/pptxgenjs/utils')

// FA_SVG: { 'fa-users': { w, h, d }, … }  (the converter's bundled offline glyphs)
const iconResolver = (className, family, glyph) => {
  const g = FA_SVG['fa-' + glyph]
  return g ? [{ d: g.d, viewBox: { w: g.w, h: g.h }, fill: accentHex, mode: 'fill' }] : null
}
const cards = parseCards(slideHtml, { iconResolver, excludeWithin: /…/ })
```

and **delete** `inlineFaIcons()` (the HTML pre-rewrite pass), `CHAR_TO_FASVG`, and the
`faVectorParts()` patch-up in `cardDataToProps` — roughly 80–100 lines, plus its
remaining `cheerio.load()` usage for that pass. The converter keeps only its offline
`FA_SVG` data (or, better, supplies `resolveIconFonts()`’s output as the
`iconResolver`), and no longer mutates HTML before handing it to the library.
