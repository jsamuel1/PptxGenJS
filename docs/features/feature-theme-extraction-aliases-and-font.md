# Feature: Theme Extraction — colour-name aliases + font-family extraction

> **Status:** Implemented
> **Implemented:** `src/utils/extract-theme.ts` — Gap 1 colour-name aliases + canonicaliser
>   (commit `74ea00dc`), Gap 2 font-family declaration scan (commit `6563e991`); covered by
>   `test/feature-theme-extraction.test.js` (370 tests passing).
> **Created:** 2026-06-10
> **Priority:** Medium — closes two extraction gaps that currently force the `html-to-pptx`
>   converter to re-implement alias mapping and font discovery on top of `extractThemeFromCSS`.
> **Target:** `@jsamuel1/pptxgenjs/utils` — extends `src/utils/extract-theme.ts`
>   (`extractThemeFromCSS`), docs `docs/features/feature-theme-extraction.md`, tests
>   `test/feature-theme-extraction.test.js`.
> **Depends on:** `extract-theme.ts` v2 (`feature-theme-extraction.md`, v4.2.0).
> **Principle:** The converter should be a *thin orchestration layer*. Theme extraction is a
>   library concern (`extractThemeFromCSS`); the converter must not re-implement variable-name
>   aliasing or font discovery locally. Where the library can recognise the deck's own colours
>   and font, it SHOULD — so every converter benefits and the source HTML's design is honoured
>   instead of degrading to a preset.

---

## Context

The `html-to-pptx` converter removed its pre-canned colour presets and its `--theme`
re-skinning flag (skill change, 2026-06-10): the theme is now extracted **entirely** from the
source HTML, with any role the deck does not name *derived* from the colours it does declare.
That change surfaced two gaps where `extractThemeFromCSS` cannot see colours/fonts the deck
plainly declares, so the value silently falls back to a preset default. The converter worked
around both locally; this spec moves the fix into the library where it belongs.

Two concrete repros (decks that render with the **wrong** accent/font today):

```html
<!-- Repro A: accent named --accent (not --purple) -> accent ignored, falls to preset 7C3AED -->
<style>:root { --bg:#003344; --accent:#FFAA00; --text:#EEFFEE; }</style>

<!-- Repro B: font declared on body, no --font var -> font ignored, falls to 'Inter' -->
<style>:root { --bg:#003344; } body { font-family: "Georgia", serif; }</style>
```

In Repro A the deck's accent (`#FFAA00`) is in `VAR_TO_SLOT` (`accent: 'accent'`), so it *is*
matched — but a deck using `--brand`, `--primary-color`, `--theme-color`, etc. is **not**.
In Repro B no font is extracted at all.

---

## Gap 1 — colour-name alias coverage is too narrow

### Problem

`VAR_TO_SLOT` (in `extract-theme.ts`) matches CSS variable names **exactly**. The mapped set is
a curated shortlist; decks routinely name the same roles differently and those names map to
nothing, so the slot keeps its preset default rather than the deck's real colour. Observed
unmapped-but-common names:

| Role | Mapped today | Common names NOT mapped today |
|------|--------------|-------------------------------|
| `accent` | `purple`, `accent`, `color-primary`, `primary` | `brand`, `brand-color`, `primary-color`, `accent-color`, `theme-color`, `highlight` |
| `accentSoft` | `purple-soft`, `accent-soft`, `color-primary-light` | `accent-light`, `primary-light`, `brand-light` |
| `text` | `white`, `text`, `color-text`, `foreground` | `text-color`, `fg`, `ink`, `body-color`, `on-background` |
| `textSecondary` | `gray`, `muted`, `color-text-secondary` | `text-muted`, `text-secondary`, `subtle`, `grey` (en-GB), `dim` |
| `bg` | `bg`, `color-bg`, `background`, `bg-deep`* | `bg-color`, `background-color`, `surface`, `page-bg`, `canvas` |
| `bgSecondary` | `bg-card`, `card`, `color-bg-secondary`, `bg-surface` | `surface-2`, `surface-variant`, `panel`, `elevated` |
| `sky` | `sky`, `blue`, `info` | `cyan`, `teal`, `azure` |
| `green` | `green`, `success` | `emerald`, `lime`, `mint` |
| `orange` | `orange`, `warning` | `amber`, `yellow`, `gold` |
| `red` | `red`, `error`, `danger` | `pink`, `rose`, `crimson` |

> *`bg-deep` maps to the dedicated `bgDeep` slot in v2.

When none of an accent's names match, the deck renders with the preset accent (`7C3AED`) even
though it declared its own — the single most visible theming error.

### Proposed change

Extend `VAR_TO_SLOT` with the synonyms above (additive — no existing mapping changes), and add
**en-GB / `*-color` suffix normalisation** so authors' spelling variants resolve without listing
every permutation:

1. Add the alias rows above to `VAR_TO_SLOT`.
2. Before lookup, normalise a bare variable name through a small canonicaliser:
   - strip a trailing `-color` / `-colour` (`brand-color` → `brand`, `text-colour` → `text`),
   - fold `colour` → `color` and `grey` → `gray`,
   - then try the exact map, then the stripped form.

```ts
function canonicalVarName (name: string): string[] {
  const lc = name.toLowerCase().replace(/colour/g, 'color').replace(/\bgrey\b/g, 'gray')
  const stripped = lc.replace(/-colou?r$/, '')
  return lc === stripped ? [lc] : [lc, stripped]   // try exact, then suffix-stripped
}
```

Matching stays **exact against an (enlarged) allowlist** — never substring — so `--bg` and
`--bg-card` still resolve to different slots. The canonicaliser only adds deterministic
spelling/suffix folding, not fuzzy matching.

### Why allowlist, not heuristics

Substring/heuristic matching (e.g. "any var containing `accent`") was considered and rejected:
it is non-deterministic across decks and silently mis-maps (`--accent-border-radius` is not a
colour). The litmus test from `feature-html-content-extractors.md` applies — two tools should
agree on the mapping from the *name*, independent of rendering. An explicit, enlarged allowlist
keeps that property.

---

## Gap 2 — font family is only read from `--font` / `--font-family` vars

### Problem

`font` is populated only when the deck declares a `--font` or `--font-family` custom property.
Many decks set their typeface directly on a rule instead:

```css
body { font-family: "Georgia", serif; }
.slide, .reveal { font-family: 'Source Sans 3', system-ui, sans-serif; }
```

`extractThemeFromCSS` never inspects `font-family` **declarations** (only `--var` custom
properties), so these decks fall back to `'Inter'`. The converter cannot fix this without
re-parsing the CSS itself — duplicating the library's job.

### Proposed change

Add an opt-in **font-family declaration scan** to `extractThemeFromCSS`, used only when no
`--font*` custom property matched, so explicit `--font` always wins:

1. Extend the font var aliases: `--font`, `--font-family`, `--font-sans`, `--font-body`,
   `--font-base`, `--typeface` → `font`.
2. If still unset, scan top-level `font-family:` declarations from a small set of likely
   theme-bearing selectors, in priority order, and take the first concrete family:
   `:root` → `html` → `body` → `.slide` / `section.slide` → `.reveal` → `*`.
   Reuse the existing `normalizeFont()` (strip quotes, take the first family) and skip CSS
   generic families (`serif`, `sans-serif`, `monospace`, `system-ui`, `ui-sans-serif`, …) so
   the result is a real face name, not `serif`.

```ts
interface ExtractThemeOptions {
  // ...existing...
  /** When no --font* var matched, scan `font-family:` rules (body/.slide/...) for the face. @default true */
  scanFontFamily?: boolean
  /** Selector priority for the font-family scan. @default [':root','html','body','.slide','section.slide','.reveal','*'] */
  fontFamilySelectors?: string[]
}
```

Implementation note: `parseCssVars` already isolates `:root` blocks; the font scan needs a
sibling regex over full rule bodies (`selector { … font-family: … }`). It is read-only, regex-
based, and DOM-free — consistent with the module's stated constraints. Computed-style cascade
remains explicitly out of scope (needs a live DOM), matching the existing limitation note.

---

## API summary (additive, default-on)

```ts
const theme = extractThemeFromCSS(css)
// Repro A: { accent: 'FFAA00', ... }  (was '7C3AED' from preset)   -- when --brand/--primary-color/... used
// Repro B: { font: 'Georgia', ... }   (was 'Inter')                -- from body { font-family }
```

No signature change; two new optional flags (`scanFontFamily`, `fontFamilySelectors`), both
defaulting to current-safe behaviour for hex-`--var` decks. `presetName` stays `'extracted'`
whenever ≥1 colour var matched.

## Test cases

```ts
// Gap 1: aliased accent + en-GB/-color suffix
let t = extractThemeFromCSS(':root{ --bg:#003344; --brand:#FFAA00; --text-colour:#EEFFEE; }')
assert(t.accent === 'FFAA00')
assert(t.text   === 'EEFFEE')

// Gap 2: font from a body rule, no --font var
t = extractThemeFromCSS('body { font-family: "Georgia", serif; }')
assert(t.font === 'Georgia')

// explicit --font still wins over a body rule
t = extractThemeFromCSS(':root{ --font:Inter; } body{ font-family:Georgia; }')
assert(t.font === 'Inter')

// generic family is skipped, not returned as the face
t = extractThemeFromCSS('body { font-family: sans-serif; }')
assert(t.font !== 'sans-serif')   // falls back to preset 'Inter'

// regression: existing exact-name mapping unchanged
t = extractThemeFromCSS(':root{ --bg:#121218; --purple:#7C3AED; }')
assert(t.bg === '121218' && t.accent === '7C3AED')
```

## Impact on the converter

Once shipped, the `html-to-pptx` converter's local alias lists in `buildTheme()` (the
multi-name `get('--purple','--accent','--brand', …)` calls) and its font-var fallback collapse
back into the single library call:

```js
const { extractThemeFromCSS } = require('@jsamuel1/pptxgenjs/utils')
const theme = extractThemeFromCSS(cssFromHtml)   // aliases + font scan handled upstream
```

Until then, the converter carries the alias/font logic locally as a documented stopgap pointing
at this spec.

## Limitations

- Still regex/text-based: no `@media`/`@import`/computed-cascade resolution (unchanged).
- The font scan picks the first concrete family from the highest-priority selector that
  declares one; it does not resolve per-element font overrides.
- `hsl()` and named colours remain returned as-is (unchanged v2 limitation).
