# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING:** `ThemePalette` type uses role-named slots (`bg`, `surface`, `text`, `accent`, etc.) instead of deck-specific slot names
- **BREAKING:** `addCallout`, `addCard`, `addBadge` default colors are now luminance-derived (WCAG 2.1 ≥ 4.5:1 contrast) using `inkForFill()` instead of hardcoded hex values
- Default accent color changed from `7C3AED` to `6366F1` (indigo-500)
- Default card fill changed from `1a1a24` to `1E293B` (slate-800)
- `@default` annotations in `core-interfaces.ts` updated to reflect new values

### Removed

- **BREAKING:** Deck-specific palette presets (`DARK_PRESET`/`LIGHT_PRESET` with branded hex values `FF9900`, `Inter`)
- **BREAKING:** `DEFAULT_EXCLUDE` regex in `parseCards` — card exclusion is now opt-in via `excludeWithin`
- **BREAKING:** `BUNDLED_ICONS` entries emptied (icon data distribution is the consumer's responsibility per ADR 0008)

## [4.3.19](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.19) - 2026-06-13

### Added

- Foreign-framework test fixtures under `test/fixtures/foreign/` covering Bootstrap, Tailwind, MUI, and WHATWG patterns
- `parseQuote` supports `<q>` inline quote elements, `<footer>` attribution, and `figure > blockquote + figcaption` (WHATWG-canonical pattern)
- `parseTimeline` supports `<time datetime="...">` elements as time markers
- `parseTable` supports `colspan` and `rowspan` spanning (header and body cells)
- `parseColumns` supports CSS `flex` container detection (in addition to CSS Grid and `column-count`)
- `parseCards` pattern options: `titleSelector`, `descSelector`, `badgeSelector`, `imageSelector` for custom card structures
- Icon font resolver `fontFaceFor()` helper; icon layer detects non-FA icon families and skips FA-only resolution
- `tokenizeCode` accepts an explicit `lang` parameter to override class-based detection
- `CDN_VERSIONS` constant exported from `@jsamuel1/pptxgenjs/utils` with pinned CDN dependency versions (FA 6.7.2, BI 1.11.3, Ion 7.4.0)

### Fixed

- `parseCards` title/description extraction: DESC_PAT/TITLE_PAT use end-anchored class matching to prevent Bootstrap `card-body`/Tailwind `text-lg` false positives; heading fallback extended through `h6`; title subtree excluded from description; direct text nodes reachable in `textBlocks`
- `parseBadges` regex anchored to prevent "vintage"/"caterpillar"/"heritage" false positives; unified badge vocabulary with `parse-cards` (added `chip`)
- `stripQuoteGlyphs` includes CJK quote glyphs 「」『』(\u300C–\u300F)
- `parseTimeline` container-swallow dedup: prefers innermost element over ancestor (fixes duplicate rows); multi-child body joined with ` — ` separator
- Icon font resolver `useCdn` defaults to `false` (no network calls without explicit opt-in); CDN URLs pinned to specific versions

## [4.3.17](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.17) - 2026-06-12

### Changed

- Documentation restructure: feature specs moved to `docs/features/`; new
  `docs/architecture/overview.md` (system overview) and
  `docs/architecture/decisions/` (lightweight ADR register seeded with the seven
  standing decisions). Guidance files (README-Fork, CONTRIBUTING, AGENTS, PROMPT)
  carry the documentation-maintenance rules; stale facts corrected (PROMPT Phase 0
  marked completed, README-Fork roadmap pointed at the live backlog). No code or
  published-artifact changes.

## [4.3.16](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.16) - 2026-06-12

### Fixed

- Chart schema: removed invalid `<c:invertIfNegative>` emission from scatter chart `<c:dPt>` elements — only bar/bar3D series permit this element per OOXML CT_BarSer

## [4.3.14](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.14) - 2026-06-12

### Added

- `textOf` strips Private Use Area (PUA) codepoints by default; pass `{ keepPUA: true }` to preserve old behaviour
- CssContext layout helpers exported from `@jsamuel1/pptxgenjs/utils`: `declOf`, `gridColumnsOf`, `flexInfoOf`, `columnCountOf`, `sizeOf`, plus `parseStyleSheets`, `cssProp`, and `EMPTY_CSS` — previously implemented but unreachable from the public surface
- `CONTRIBUTING.md` with conventions for all contributions (spec lifecycle, public-API definition of done, git staging discipline); `TESTING.md` gains automated test conventions and `RELEASING.md` gains release gates
- API parity test (`test/feature-api-parity.test.js`): the `/utils` runtime exports and `types/utils.d.ts` declarations must match in both directions

### Fixed

- `gridColumnsOf` track counting: paren-aware tokenizer so `repeat(3, minmax(0, 1fr))` = 3 (was 6 — the exact string Tailwind `grid-cols-3` emits), standalone tracks mixed with `repeat()` are counted (`200px repeat(2, 1fr)` = 3), and `calc(...)` counts as one track
- `!important` is stripped from cascade-resolved values, and `display: grid !important` no longer defeats grid container detection in `parseCards`
- `@media` block contents are no longer applied unconditionally as base class rules (known limitation: doubly-nested @-blocks, e.g. `@media` inside `@supports`, still leak their trailing rule — documented in the spec)
- `flexInfoOf`: explicit `flex-grow` longhand wins over the `flex` shorthand; `flex-flow` shorthand parsed
- Declared `tokenizeCode`, `codeRuns`, `TokenKind`, and `CodeRunsOptions` in `types/utils.d.ts` — they were exported at runtime but invisible to TypeScript consumers

## [4.3.13](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.13) - 2026-06-11

### Added

- CssContext layout helpers: `declOf`, `gridColumnsOf`, `flexInfoOf`, `columnCountOf`, `sizeOf` — resolve layout properties through the cascade-lite context (inline > class-rule > var). `parseCards` now detects grids declared via class rules, not just inline styles.
- `parseCards` sibling-card adoption: cards immediately following a grid container that are structurally similar to the grid's cards are now included in the result
- Extended HTML named-entity table from 6 → ~250 entries (Latin-1 supplement, general punctuation, symbols, math operators, Greek letters) in `parseHtml`/`textOf`
- Exported `decodeEntities(s: string): string` from `@jsamuel1/pptxgenjs/utils` for downstream consumers

## [4.3.11](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.11) - 2026-06-11

### Fixed

- `embedFont()` now works in Node `vm` sandbox contexts by replacing `await import('node:fs')` with `require('fs')` in `encodeEmbeddedFonts()`. Also skips writing 0-byte `.fntdata` ZIP entries when font files cannot be read.

## [4.3.8](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.8) - 2026-06-10

- Syntax-Highlighted Code helper: `tokenizeCode()` tokenizer + `codeRuns()` text-run builder (docs/features/feature-syntax-highlighted-code.md)

## [4.3.7](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.7) - 2026-06-10

### Added

- New `fit: 'fill'` option for `addText()` — scales text UP to fill the box width/height
- Morph slide transition (`transition: { type: 'morph', option: 'byObject' }`) emitting `<p14:morph>` for PowerPoint's Auto-Animate tween effect between consecutive slides
- New `morphId` option on shapes/text/images for stable Morph transition matching across slides

## [4.3.6](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.6) - 2026-06-10

### Added

- Fragment animation timing-tree regression tests (ordered steps, entrance+exit, emphasis mid-chain)
- CI-guard regression test proving no `eval`/`new Function`/`wasm` code-generation paths exist in the core library or its bundled dependencies. The test exports a deck inside a `vm.createContext` with `codeGeneration: { strings: false, wasm: false }` and a minimal global set (no `process`, no `setImmediate`, no `global`). Catches any future introduction of string code-generation. (`test/feature-sandbox-runtime.test.js`)

## [4.3.5](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.5) - 2026-06-10

### Fixed

- Compressed export (`stream({ compression: true })` / any DEFLATE write path) no longer requires a pre-existing `setImmediate` global. JSZip's DEFLATE path schedules async chunks via a bare `setImmediate(...)`; in a hardened Node `vm` sandbox (which exposes only `setTimeout`/`clearTimeout`, not `setImmediate`/`clearImmediate`) this threw `ReferenceError: setImmediate is not defined` while writing the `.pptx`. The library now polyfills `globalThis.setImmediate`/`clearImmediate` from `setTimeout`/`clearTimeout` immediately before `zip.generateAsync`, and only when they are absent — a real Node implementation is never clobbered and no emitted OOXML changes. Closes Gap 2 of `docs/features/feature-sandbox-runtime-compat.md`. (`src/pptxgen.ts`; regression test `test/feature-sandbox-runtime.test.js`.)

## [4.3.4](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.4) - 2026-06-10

### Added

- Node-argument overloads for the bounded HTML query helpers (`@jsamuel1/pptxgenjs/utils`) — `query`, `matches`, and `closest` now accept an `HNode` in addition to a `string` selector, giving cheerio containment/identity parity for the documented `.find`/`.is`/`.closest` mapping. `query(root, node)` is a descendant test (returns `[node]` iff `node` is a descendant of `root`, not `root` itself, else `[]`, mirroring `$(root).find(node)`); `matches(node, other)` is an identity test (`node === other`, mirroring `$(node).is(other)`); `closest(node, other)` is an ancestor-or-self identity test (returns `other` iff `other === node` or `other` is an ancestor of `node`, else `null`, mirroring `$(node).closest(other)`). All three reuse the existing `isAncestorOrSelf` primitive with no new traversal. `isAncestorOrSelf(a, b)` is now **exported** from `/utils` as a public containment primitive. Previously passing a node stringified it to `"[object Object]"` and threw the engine's opaque `unsupported selector: …` catch-all; a non-string/non-`HNode` argument now throws a typed `TypeError` instead. String-selector behaviour is byte-for-byte unchanged (existing grammar tests still pass). Pure utility; emits no OOXML and is not on the main `PptxGenJS` class.

## [4.3.1](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.1) - 2026-06-10

### Added

- `layoutStack()` pure vertical region-flow layout primitive — `pptx.layoutStack(props)` (the vertical companion to `layoutGrid()`). Given an `area` and a list of `blocks`, it returns one `{ x, y, w, h }` box (inches) per block, owning the y-cursor arithmetic that HTML→PPTX converters and slide builders otherwise re-hand-roll. Blocks size by fixed `height` or proportional `flex` weight (a block with neither is treated as `flex: 1`); fixed heights plus `(blocks-1)*gap` are summed and any leftover area height is split among flex blocks by weight. When no flex block is present, `align` distributes the leftover space (`start`/`center`/`end`/`between`/`stretch`); when blocks overflow the area, `overflow` controls the response (`shrink` reduces fixed blocks toward their `minHeight` proportionally to fit, `clip` keeps natural heights, `grow` keeps natural heights and sets `result.overflow = true`). Each box is `area.w - 2*inset` wide at `area.x + inset` (per-block `inset` default 0). Empty `blocks` returns `[]`; a non-positive `area` width/height throws (matching `layoutGrid`). Types `LayoutStackBlock`/`LayoutStackProps`/`LayoutStackCell`/`LayoutStackResult` are exported in `types/index.d.ts`. Pure, deterministic, side-effect-free; emits no OOXML and is additive/default-off — no existing behaviour changes.

### Fixed

- `parseColumns` (`@jsamuel1/pptxgenjs/utils`) no longer treats unrelated classes that merely contain the substring `col` — e.g. `collapse`, `protocol`, `colour-swatch`, `col-header` — as column children. The explicit-column detector previously used a case-insensitive substring test (`/col/i`) gated only on ≥2 such siblings, so two unrelated `<div class="collapse">`/`<div class="protocol">` boxes were mis-detected as a 2-column layout. The match is now anchored per class token (`/^col(?:umn)?(?:-\d+)?$/i`), accepting `col`/`column`/`col-6`/`col-12` and rejecting the substring lookalikes. The CSS `column-count`/`columns` detection branch is unchanged. (Bootstrap responsive forms like `col-md-6` remain out of scope.)

## [4.3.0](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.3.0) - 2026-06-09

### Fixed

- Custom-geometry path parser (`svgPath`) now handles SVG elliptical-arc (`A`/`a`) and smooth-curve (`S`/`s`, `T`/`t`) commands. Previously `svgPathToOoxml()` recognised only `M`/`L`/`H`/`V`/`C`/`Q`/`Z`, so an `A`/`S`/`T` command's numeric arguments were swallowed by the preceding command and emitted as garbage `<a:lnTo>` points — rendering as overflow spikes or a broken shape PowerPoint had to "repair". The parser now pre-folds its input through the existing, tested `normalizeSvgPath()` (`@jsamuel1/pptxgenjs/utils`), which expands arcs to cubic béziers (W3C SVG 1.1 F.6.5, via `arcToCubics`), reflects smooth curves (`S`→`C`, `T`→`Q`), and resolves `H`/`V`/relative commands to absolute `M`/`L`/`C`/`Q`/`Z`. Real-world SVG paths (icon sets, logos, hand-authored arcs) now render correctly with no caller-side pre-normalisation, and plain `M/L/C/Q/H/V/Z` paths are byte-for-byte unchanged.

### Added

- HTML content extractors `parseTimeline` / `parseQuote` / `parseBadges` / `parseCallout` (`@jsamuel1/pptxgenjs/utils`) — `import { parseTimeline, parseQuote, parseBadges, parseCallout } from '@jsamuel1/pptxgenjs/utils'`. The four remaining NEUTRAL, structural recognisers that complete the `feature-html-content-extractors` set alongside `parseTable`/`parseColumns`. `parseTimeline(htmlOrNode, opts?)` returns `TimelineRow[]` (`{ marker, body }`) — detection is EXPLICIT (`.timeline-item`, else the first `.timeline` container's direct children, with a `.time`/`.timeline-time` marker) then HEURISTIC (elements whose text starts with a `7:00`/`12:30 PM` time token), with nested-wrapper de-dup so a row wrapped N-deep counts once (the outermost match wins). `parseQuote(htmlOrNode, opts?)` returns `QuoteData` (`{ text, attribution? }`) from the first `blockquote`/`.quote-text`, removing the `cite`/`.quote-attr` attribution from `text` and stripping surrounding quote glyphs. `parseBadges(htmlOrNode, opts?)` returns a `string[]` of pill/badge labels (`[class*="badge"|"pill"|"tag"]`, nested-de-duped, `[]` when none — never `null`). `parseCallout(htmlOrNode, opts?)` returns `CalloutData` (`{ text, accent? }`) from the first bordered box (detectable `border`/`border-left`/`border-color` colour) or `[class*="callout"]` element. All accept a raw HTML string OR an `HNode` from `parseHtml`, take an `excludeWithin?: RegExp`, resolve colours through the shared `css-context` (never guessed — omitted when undetectable), and are pure, synchronous, and dependency-free. As with the rest of the set, extraction is ADDITIVE (one input may yield a quote AND a table AND badges) and there is deliberately NO `Archetype`/`classifySlide` API — slide-role decisions stay a consumer concern. Pure utility; emits no OOXML and is not on the main `PptxGenJS` class.
- HTML content extractors `parseTable` / `parseColumns` (`@jsamuel1/pptxgenjs/utils`) — `import { parseTable, parseColumns } from '@jsamuel1/pptxgenjs/utils'`. Two NEUTRAL, structural recognisers that extend the `parseCards()` precedent to the other structures every HTML→PPTX converter re-implements. `parseTable(htmlOrNode, opts?)` turns the first `<table>` into `TableData` (`{ rows: Array<Array<{ text, isHeader, color? }>> }`) ready to map onto `slide.addTable()` — `isHeader` reflects `<th>`, cell `color` resolves through the shared colour context (inline style + `<style>` class rule + `var()`), nested-table cells are not double-counted, an empty `<table>` is still `{ rows: [] }`, and non-table input returns `null`. `parseColumns(htmlOrNode, opts?)` detects an EXPLICIT multi-column structure (≥2 direct-child elements with a `col`/`column`/`col-*` class, or a `column-count`/`columns` ≥ 2 CSS rule) and returns one `ColumnData` (`{ text }`) per column; plain prose, a single block, or a `<table>` return `null` (a table is never columns). Both accept a raw HTML string OR an `HNode` from `parseHtml` (parse once, query many), take an `excludeWithin?: RegExp` to skip mockup/flow regions, and are pure, synchronous, and dependency-free. By design these extractors **represent** the HTML rather than classify it: extraction is ADDITIVE (a single input may yield BOTH a table and columns) and there is deliberately NO `Archetype`/`classifySlide` API — slide-role decisions stay a consumer concern. The shared colour-resolution context used by `parseCards()` is factored into `src/utils/css-context.ts` so all extractors resolve colours through one implementation (`parseCards` behaviour is byte-identical). Pure utility; emits no OOXML and is not on the main `PptxGenJS` class.
- HTML tree-builder + bounded selector engine (`@jsamuel1/pptxgenjs/utils`) — `import { parseHtml, query, queryOne, closest, matches, textOf, attr, clone, outerHtml } from '@jsamuel1/pptxgenjs/utils'`. `parseHtml(html)` exposes the pure, dependency-free (no cheerio/DOM/browser) HTML tree-builder that already backs `parseCards()`/`parseSvg()`/`extractThemeFromCSS()`, returning an `HNode` tree (`tag`/`attrs`/`classes`/`style`/`children`/`parent`, `text` on `#text` nodes, `raw` on captured `<svg>` subtrees); parsing is tolerant and never throws on malformed/unclosed HTML. A small **bounded** CSS-selector engine layers on top — `query`/`queryOne` (like `querySelectorAll`/`querySelector`, document order), `closest` (nearest ancestor-or-self), and `matches` — supporting a documented, finite grammar: universal `*`, type, `.class`, `#id`, `[attr]`, `[attr="v"]`, `[attr*="v"]`, compound (type+class/attr, no space), descendant (space), child (`>`), and selector lists (comma). Anything outside that grammar (pseudo-classes/elements, sibling combinators `+`/`~`, `^=`/`$=`/`~=`/`|=` attribute operators, namespaces, `@media`, specificity) throws `unsupported selector: …` rather than silently returning a wrong result. Helpers `textOf` (concatenated descendant text), `attr` (case-insensitive lookup), `clone` (detached deep copy), and `outerHtml` (serialize; uses `raw` verbatim for `<svg>`) round out the surface. This lets an HTML→PPTX converter drop its `cheerio` dependency entirely. The tree-builder is now shared from `src/utils/html-dom.ts`; `parseCards()` imports it (de-duplicated) with no behaviour change — and now also captures valueless boolean attributes (`data-demo`) so `[attr]` selectors work. Pure utility; emits no OOXML and is not on the main `PptxGenJS` class. scans an HTML string for icon-font elements (Font Awesome, Material Icons/Symbols, Ionicons, Phosphor, Bootstrap Icons, or a custom font) and asynchronously resolves each to vector path data, returning a `Map<string, ResolvedSvgPart[]>` keyed by the icon's class string (Material/ligature entries keyed `family|glyph`). Resolution tries, first hit wins: a caller `customResolver`, inline/supplied CSS `::before { content }` codepoint extraction, local font-file glyph outlines, a CDN fetch for known fonts (gated by `useCdn`, cached in `cacheDir`), then a small bundled fallback map; each `ResolvedSvgPart` carries a `source` tag noting how it was resolved, and an unresolvable icon is omitted rather than throwing. Output drops straight into `slide.addCard({ icon: { parts } })` / `addShape('custGeom', { svgPath })` or feeds `parseCards()`'s synchronous `iconResolver` hook, replacing the html-to-pptx converter's hardcoded `FA_SVG` map with per-deck dynamic resolution for any icon font. Pure utility (only side effects are the optional, gated CDN `fetch`/cache); emits no OOXML and is not on the main `PptxGenJS` class. The icon-family classifier is shared with `parseCards()` via `src/utils/icon-classify.ts` so both recognise families identically.
- `parseCards` font-icon resolution (`@jsamuel1/pptxgenjs/utils`) — `parseCards()` no longer silently drops font-icon identity. A detected `<i class="fa-*">`/`<span class="fa-*">` now produces a glyph-aware `fontIcon` descriptor that carries `glyphName` (e.g. `'users'`), `className` (e.g. `'fas fa-users'`), and the detected `fontFamily` key (`'fa' | 'bi' | …`) in addition to the existing `char`/`fontFace`, and `fontFace` resolves to the correct Font Awesome family (`Font Awesome 6 Free Solid` / `… Regular` / `Font Awesome 6 Brands`). A new synchronous `iconResolver?(className, fontFamily, glyphName) => SvgPart[] | null` option on `ParseCardsOptions` lets a caller (or a bundled glyph map) upgrade a font-icon to a crisp `{ type: 'svg', parts }` vector during parsing; returning `null`/`[]` falls back to the glyph-aware `fontIcon`. When the input HTML carries an inline `<style>` `.icon::before { content: "\fXXX" }` rule, `fontIcon.char` is populated with the resolved codepoint. All additions are additive and default-off — existing `icon.type === 'fontIcon'` consumers are unchanged, and `parseCards` stays synchronous and dependency-free. The shared classifier is extracted to `src/utils/icon-classify.ts` so `parseCards()` and `resolveIconFonts()` recognise icon families identically.

## [4.2.1](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.2.1) - 2026-06-08

### Changed

- `parseCards` (`@jsamuel1/pptxgenjs/utils`) colour resolution — card colours (`cardFill`, `borderColor`, `titleColor`, `descColor`, `iconColor`, `tileFill`, the badge fill, and the `accentBar`) now resolve through a cascade-lite of the input HTML's `<style>` block in addition to inline `style="…"`: simple class rules (`.foo { background; color; border; border-left }`, last-declared wins) and `var(--name[, fallback])` references against `:root`/`html`/`body` custom properties — in both inline styles and class rules. Precedence is inline style > class rule. The browser computed-style cascade (specificity ranking, id/descendant/combinator selectors, `@media`) stays out of scope (needs a live DOM). Inputs with no `<style>` block and no `var()` produce byte-identical `CardData` to before.

## [4.2.0](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.2.0) - 2026-06-08

### Added

- SmartArt / diagrams — `slide.addSmartArt({ x?, y?, w?, h?, layout: 'list' | 'process', items, color? })` adds a SmartArt diagram from a flat array of strings. `layout: 'process'` lays the items out left-to-right; `layout: 'list'` stacks them top-to-bottom; `color` (hex) sets the node fill. Each call packages the five linked diagram parts PowerPoint expects — `ppt/diagrams/{data,layout,quickStyle,colors,drawing}{N}.xml` — plus a `<p:graphicFrame>` carrying `<dgm:relIds r:dm r:lo r:qs r:cs>`, the matching slide relationships, and `[Content_Types].xml` Overrides. A precomputed `<dsp:drawing>` cache renders the diagram out-of-the-box without PowerPoint recomputing the layout. Minimal `list`/`process` subset; dependency-free. Empty/invalid `items` or an unknown `layout` is a no-op, and decks that never call it are byte-for-byte unchanged.
- Ink annotations — `slide.addInk({ strokes, color?, width? })` adds stylus/handwriting ink to a slide. Each stroke is an array of `[x, y]` points in inches (converted to EMU on export); `color` (hex) and `width` (points) style the stroke brush. Each call packages a `ppt/ink/ink-{N}-{i}.xml` InkML part referenced from the slide via a `<p:contentPart r:id>` plus a `customXml` slide relationship and an `application/inkml+xml` `[Content_Types].xml` Override; multiple inks per slide each get their own part/relationship/contentPart, and the contentPart `r:id` stays in lockstep with the relationship id. Empty or degenerate strokes are dropped (a call with no valid points is a no-op), and decks that never call it are byte-for-byte unchanged.
- Handout master — `pptx.defineHandoutMaster({ background?, headerFooter? })` defines the layout PowerPoint uses when printing multiple slides per page, so a deck can carry branded handout headers/footers. It packages a `/ppt/handoutMasters/handoutMaster1.xml` part (with the matching presentation relationship and `[Content_Types].xml` Override) and emits `<p:handoutMasterIdLst>` in `presentation.xml` in canonical `CT_Presentation` order (after `notesMasterIdLst`, before `sldIdLst`). `background` sets a solid hex fill (otherwise the theme background is inherited) and `headerFooter` ({ header, footer, dateTime, slideNumber }) drives `<p:hf>` and the header/footer placeholder text. Default-off: decks that never call it emit no part, relationship, Override, or id list and are byte-for-byte unchanged.
- Card count badge (`addCard()` v2) — the `badge` option now accepts a count-bubble variant `{ type: 'count', value, fill?, color?, position? }` in addition to the text pill. It draws a small circle (`ellipse`) with the count centred inside, positioned `'top-right'` (default) or `'inline-right'` (vertically centred on the card's right edge, for nav/sidebar notification indicators). Pure composition of existing primitives (no new OOXML, no new dependency); a non-finite `value` renders `'0'` and never throws. Cards using the existing `{ text }` text-pill badge are byte-for-byte unchanged.
- Separator rule helper — `slide.addSeparator({ x, y, w?, h?, color?, thickness?, opacity?, orientation? })` draws a thin horizontal (default) or vertical divider as a single `rect`. `opacity` (0–1) maps to the rect fill transparency, `thickness` (inches) is the rule's short dimension, and `orientation: 'vertical'` swaps which of `w`/`h` spans. It is a pure composition of the existing shape primitive (no new OOXML, no new dependency), clamps degenerate `thickness`/`opacity` to defaults (never throws), and is also available on the group handle returned by `addGroup()`. Decks that don't call it are byte-for-byte unchanged.
- Theme extraction converter-equivalence (`extractThemeFromCSS`, `@jsamuel1/pptxgenjs/utils`) — the palette extractor now reproduces the html-to-pptx converter's `buildTheme()`: it parses `rgb()`/`rgba()` colours to hex, resolves `var(--name)` references against the parsed variables, computes derived colours (`cardLine` = `mix(accent, bg, 0.72)`, `cardFill` = `mix(bgMid, bg, 0.4)`, and `barStops` from a `--bar-gradient` declaration or `[accent, accentSoft, sky]`), extracts an extended palette (`bgMid`/`bgLight`/`bgDeep`/`coral`/`gray100`/`gray300`/`gray500`), and attaches `presetName` + raw `vars` metadata. A new `forcePreset` option bypasses CSS extraction and uses a named preset only (an unknown name falls back to the default preset rather than throwing); `derivedColors`/`resolveVarRefs`/`parseRgb` (all default-on) and `barGradientVar` tune the behaviour. All additions are additive — existing core-slot extraction from hex inputs is unchanged.
- HTML card-grid parser — `import { parseCards } from '@jsamuel1/pptxgenjs/utils'` turns an HTML card grid into `CardData[]` that spread straight into `slide.addCard()`. Detection is structure-driven and framework-agnostic: cards are found by a configurable class pattern (`cap-item`, `wf-card`, `feature-tile`, … or a bare `card`) or by a grid/flex container, then each card's icon (inline `<svg>` handed to `parseSvg()`, a Font-Awesome glyph, or a leading emoji), title, description, badge, and colours are read from its internal structure. Pure and dependency-free (a tiny built-in HTML tree-builder — no cheerio, no DOM); emits no OOXML and is not on the main `PptxGenJS` class. Colours resolve from inline `style` attributes, from simple class rules in a `<style>` block, and from `var()` references against `:root` (inline style takes precedence over class rules); only the browser computed-style cascade remains out of scope.
- Card multi-colour SVG icons (`addCard()` v2, final) — the `icon` option now accepts `{ parts: SvgPart[] }` (the output of `parseSvg()` from `@jsamuel1/pptxgenjs/utils`). Each part renders as its own `<a:custGeom>` child with its own resolved fill, gradient, or stroke, so a multi-path / multi-colour logo keeps its real colours instead of being flattened to a single tint. `iconColor` intentionally does not override per-part colours. Cards that don't pass `{ parts }` are byte-for-byte unchanged.
- SVG normalisation utility — `import { parseSvg } from '@jsamuel1/pptxgenjs/utils'` parses a raw SVG string into a list of `SvgPart`s whose `d` is a normalised, absolute path using only the commands the custom-geometry engine understands (`M`/`L`/`C`/`Q`/`Z`). Elliptical arcs (`A`), smooth curves (`S`/`T`), horizontal/vertical lines (`H`/`V`), relative commands, and the SVG primitives (`circle`/`ellipse`/`rect` incl. `rx`/`ry`/`line`/`polyline`/`polygon`) are all folded into that subset, and per-path `url(#id)` gradient references are resolved to `GradientFillProps`. Multi-colour logos yield one part per colour (not a flattened tint). Each part drops straight into `slide.addShape('custGeom', { svgPath: { d, viewBox }, fill, line })`. Pure and dependency-free (no DOM, no third-party SVG library); emits no OOXML and is not on the main `PptxGenJS` class.
- Avatar & badge helpers — `slide.addAvatar({ initials, size?, fill?, color?, fontFace?, fontSize? })` draws a filled circle with centred initials (a user/profile chip), and `slide.addBadge({ text, shape?, fill?, color?, fontSize?, bold?, w?, h? })` draws a pill (`roundRect` with a full corner radius, sized to the text) or a circular count bubble (`shape: 'circle'`) with a centred label. Both are pure compositions of existing primitives (no new OOXML) and are also available on the group handle returned by `addGroup()`, so they can sit inside mockup sidebars. Decks that don't call them are byte-for-byte unchanged.
- Callout v2 (`addCallout()`) — quote/callout blocks now support a left accent bar (`accentBar: { color?, width? }`, solid or gradient), an `attribution` line below the body (styled via `attributionFont`), italic body (`fontItalic`) and `fontFace`, multi-run body text (pass a `TextProps[]` for `text`), left-aligned layout, and configurable inner `padding` (single number or per-side). Supplying `accentBar` or `attribution` switches the callout to a composed shape group; callouts without either (plain centred text in a rounded rect) are byte-for-byte unchanged.
- Card icons (`addCard()` v2) — the `icon` option now accepts a font-icon glyph (`{ char, fontFace, color? }`, e.g. Font Awesome) in addition to an SVG path or emoji string; `iconFill` accepts `'none'` or `false` to render a bare icon with no container tile; a new `iconColor` option tints the glyph independently of the tile; and a new `accentBar` option (`{ color?, width? }`) draws a thin solid- or gradient-filled vertical strip on the card's left edge (category colour-coding / brand accent). Existing cards (emoji/SVG icon, no `iconColor`/`accentBar`) are byte-for-byte unchanged.
- Gradient text (glyph) fill — `addText`'s `color` option now accepts a gradient object (`{ type: 'gradient', direction?, stops: [{ position, color, transparency? }] }`) so the gradient fills the glyphs themselves (emitted as a run-level `<a:gradFill>`), rather than only the text-box background. Passing a plain hex/theme color string is byte-for-byte unchanged.
- Slide comments — `slide.addComment({ author, text, x?, y?, date? })` adds review/QA comments to a slide. Authors are automatically deduplicated into a shared author list, each comment can be anchored at an inches position (defaults to 0.5", 0.5"), and timestamps accept a `Date` or ISO string. Emits the classic `p:cm` + `commentAuthors.xml` form (widely supported); decks that don't call it are byte-for-byte unchanged.

## [4.1.7](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.7) - 2026-06-08

### Added

- Embedded fonts — `pptx.embedFont({ family, regular, bold?, italic?, boldItalic? })` embeds TrueType/OpenType font files directly in the `.pptx` so decks display with the intended typeface even on machines that don't have the font installed. Each face is a filesystem path (Node), a base64 string, or a `data:` URI; only `.ttf`/`.otf` faces are accepted (others are skipped with a warning). The full font is embedded (no subsetting). Decks that don't call it are byte-for-byte unchanged.
- Structured / talking-points speaker notes — `slide.addNotes()` now accepts an array of paragraph objects (`{ text, bullet?, indentLevel? }`) in addition to a plain string. Each entry becomes its own paragraph in the notes slide, with optional bullets and indent levels, so you can author outlined talking points instead of one block of text. Passing a string behaves exactly as before.
- Photo album — `pptx.photoAlbum = { blackWhite?, showCaptions?, layout?, frame? }` marks a deck as a PowerPoint photo album, with options for black-and-white rendering, captions, a per-slide picture layout, and a frame style. You still add the image slides yourself; this just records the album metadata.
- Custom slide shows — `pptx.addCustomShow({ name, slides })` lets you define one or more named subsets of your deck (for example, a "short version" or an audience-specific cut) that play as their own slideshow inside the same file. Decks that don't use it are unaffected.

## [4.1.6](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.6) - 2026-06-08

### Added

- East-Asian line-break (kinsoku) rules — `pptx.kinsoku = { lang?, invalStChars?, invalEndChars? }` controls which characters are not allowed to start or end a line in CJK (Chinese/Japanese/Korean) text. It defaults to Japanese conventions, so most users only need to set `lang`.
- Navigation action buttons — hyperlinks on text, shapes, and images can now jump around the slideshow itself: `hyperlink.action` accepts `nextSlide`, `prevSlide`, `firstSlide`, `lastSlide`, and `endShow`, making it easy to build interactive next/previous/home controls.
- Hover-activated hyperlinks — `hyperlink.on: 'hover'` triggers a link on mouse-over instead of on click (the default remains `'click'`). Works for links to URLs or other slides on text, shapes, and images.
- Motion-path animation — `animation = { type: 'motionPath', path }` moves an object along a custom path you describe with simple SVG-style move/line/curve commands, using slide-relative coordinates.
- 3-D bevel and extrusion on shapes — `bevel = { top?, bottom?, depth?, contour?, material? }` gives shapes a raised, beveled, or extruded 3-D look with control over depth, edge contour, and surface material.
- Soft-edge effect on shapes and images — `softEdge = { radius }` feathers (softly fades) the edges of a shape or image; the larger the radius, the softer the edge.
- Reflection effect on shapes and images — `reflection = { blur?, distance?, size?, opacity?, fadeDirection? }` adds a fading mirror-image reflection beneath a shape or image, and can be combined with shadow and glow.
- Notes-master header/footer — `pptx.notesMaster = { slideNumber?, dateTime?, footer?, header? }` configures the shared header, footer, date, and slide-number areas on the notes pages.

### Fixed

- Shapes that had both a shadow and a glow produced a file PowerPoint flagged as needing repair, because the two effects were written in the wrong order. They are now emitted in the order the format requires. Shapes with only one effect are unchanged.

## [4.1.5](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.5) - 2026-06-08

### Added

- Pattern (hatch) fills on shapes — `fill = { type: 'pattern', preset, foreColor, backColor? }` fills a shape with one of 54 built-in hatch patterns (diagonal lines, cross-hatch, dot percentages, and more). An unknown pattern name is skipped with a warning rather than producing a broken file.
- Picture (image) fills on shapes — `fill = { type: 'image', path? | data?, sizing?, transparency? }` fills a shape with an image that can either stretch to fit or tile, with optional transparency. Reuses the same image pipeline as `addImage()`, including de-duplication of repeated images.
- Emphasis animations — `animation.type` now supports `pulse`, `spin`, `grow`, and `colorPulse` to draw attention to an object that is already on screen.
- Exit animations — `animation.type` now supports `disappear`, `fadeOut`, `flyOut`, and `zoomOut` to animate an object leaving the slide (the counterparts to the entrance effects).
- Slide-master header/footer config — `defineSlideMaster({ headerFooter: { slideNumber?, dateTime?, footer? } })` adds a first-class way to set up footers, dates, and slide numbers on a master layout. `dateTime` can be an auto-updating field or a fixed value.
- Per-slide header/footer override — `slide.headerFooter = { footer?, dateTime? }` sets a footer and/or date on an individual slide.

## [4.1.4](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.4) - 2026-06-08

### Added

- Grid layout helper — `pptx.layoutGrid({ items, columns, area, gap?, ... })` calculates evenly spaced `{ x, y, w, h }` positions for a set of items within a region, so you no longer have to hand-compute the math for card grids, icon grids, and comparison layouts.
- Structured card helper — `slide.addCard({ x, y, w, h, title, description?, icon?, badge?, ... })` builds a complete "card" (rounded background, optional icon, title, description, and badge) in a single call, replacing the 5–8 manual `addShape`/`addText` calls a card usually takes. An optional animation applies to the whole card at once.
- Animation grouping shortcut — `animation.group` and `animation.stagger` let related objects animate together and reveal group-by-group, with an optional stagger delay between items in a group, instead of wiring up triggers and delays by hand.
- Theme extraction utility — a new optional `@jsamuel1/pptxgenjs/utils` entry point provides `extractThemeFromCSS(css, ...)`, which reads CSS custom properties (`:root` variables) and builds a color/font palette, falling back to built-in light/dark presets for anything the CSS omits. Runs in Node.js with no DOM and no dependencies.

### Fixed

- Doughnut charts crashed PowerPoint's validation when given an out-of-range `holeSize`; the value is now clamped to the valid 10–90 range (e.g. `500 → 90`, `5 → 10`). Valid values are unchanged.
- Gradient fills with out-of-range stop positions or transparency values produced an invalid file; those values are now clamped to 0–100. Valid values are unchanged.
- Scatter charts with data labels enabled crashed during file generation when a series had no `labels` array; the label lookup is now safe, so such a series simply emits no per-point labels instead of failing.
- Scatter and bubble charts failed PowerPoint's validation because their numeric x-axis included category-axis-only settings; those settings are now only written for true category/date axes. Other chart types are unchanged.
- Line and combo charts failed validation due to a missing grouping element and a marker/data-label ordering issue; both are now emitted correctly. Other chart types are unchanged.
- `invertIfNegative` was written on chart series types that don't support it (area, line, radar, combo), causing a validation error; it is now limited to bar charts where it belongs.

## [4.1.3](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.3) - 2026-06-08

### Changed

- Internal release-automation only: the publish workflow now dispatches automatically after a version bump. No library changes.

## [4.1.2](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.2) - 2026-06-07

### Added

- Shape grouping — `slide.addGroup({ x, y, w, h })` returns a group you can add shapes and text to using coordinates relative to the group's origin, so clusters of objects move and lay out together without manual position math.
- Shadow and glow effects on shapes — `shadow = { type: 'outer', blur, offset, angle, color, opacity }` and `glow = { size, color, opacity }` add drop shadows and glows to shapes.
- Rounded-rectangle callout helper — `slide.addCallout({ text, x, y, w, h, ..., cornerRadius })` is a one-call shortcut for a rounded rectangle with centered text and a configurable corner radius.

## [4.1.1](https://github.com/jsamuel1/PptxGenJS/releases/tag/v4.1.1) - 2026-06-07

### Added

- Gradient fills — `fill = { type: 'gradient', direction?, stops[], rotWithShape? }` adds multi-stop gradient fills (with per-stop color, position, and transparency) to shapes, text-box backgrounds, and table cells.
- Slide transitions — `slide.transition = { type, duration?, direction? }` adds native between-slide transitions: `fade`, `push`, `wipe`, `cover`, `split`, `cut`, and `none`, with optional speed and direction.
- Entrance animations — `animation = { type, duration?, delay?, trigger?, direction? }` animates shapes, text, and images onto the slide with `appear`, `fadeIn`, `flyIn` (directional), and `zoomIn`, triggered on click, with the previous item, or after it.
- Number-counter text — `counter = { from, to, suffix?, stepMs? }` on `addText()` produces a count-up effect that animates a number from one value to another.
- Multi-column text — `columns` (and optional `columnSpacing`) on `addText()` flows text into multiple columns within a single text box, so you no longer need to position separate side-by-side boxes by hand.
- SVG-to-shape conversion — `svgPath = { d, viewBox: { w, h } }` on `addShape()` draws an SVG path as a true vector shape (custom geometry) instead of rasterizing it to a PNG, keeping icons crisp. A reusable `svgPathToOoxml()` helper is also exported.

### Fixed

- Many decks triggered PowerPoint's "needs repair" dialog. The following root causes are now fixed: paragraph properties were repeated for every text run ([#1322](https://github.com/gitbrent/PptxGenJS/issues/1322)); a slide-master override was written once per slide instead of once per master ([#1444](https://github.com/gitbrent/PptxGenJS/issues/1444), [#1449](https://github.com/gitbrent/PptxGenJS/issues/1449)); solid-color slide backgrounds were missing a required element ([#1442](https://github.com/gitbrent/PptxGenJS/issues/1442)); and shapes added without text were missing their text-body element ([#1441](https://github.com/gitbrent/PptxGenJS/issues/1441)).
- `addShape()` with the friendly string aliases `"oval"`, `"rectangle"`, and `"roundedRectangle"` produced invalid shape names that PowerPoint stripped during repair; these now map to valid shapes.
- Entrance animations did not play in sequence — every effect fired at once regardless of its trigger. Animations are now grouped into proper build steps so they play click-by-click and one-after-another as configured.
- Section GUIDs were written in lowercase hex, which failed PowerPoint's validation; they are now uppercase.
- Combo charts using secondary axes emitted broken axis references, and 2-D bar/line/area/radar charts referenced a series axis that was never defined; the axis references are now generated correctly.
- The notes master referenced the wrong theme file (`theme1.xml` instead of its own `theme2.xml`) ([#1443](https://github.com/gitbrent/PptxGenJS/issues/1443), [#1449](https://github.com/gitbrent/PptxGenJS/issues/1449)).
- `[Content_Types].xml` listed media types that weren't actually present in the deck (including a `vml` entry with no matching part); only the types in use are now declared.
- Every generated `.pptx` contained empty `ppt/charts/`, `ppt/charts/_rels/`, and `ppt/embeddings/` folders even when the deck had no charts; these are now omitted unless needed.
- Calling `writeFile()`, `stream()`, or `write()` more than once on the same presentation corrupted shadow settings on the later calls; the shadow options are no longer mutated during output.
- Shadow colors prefixed with `#` produced an invalid color value; the leading `#` is now stripped.
- 8-character (RGBA) hex colors silently fell back to black and dropped their alpha; they are now parsed into a color plus a transparency value.
- Empty layout placeholders showed a stray "Click to add text" hint on top of populated content, because the empty stub was stored as text rather than as a placeholder.
- `bullet: { type: "bullet" }` produced no bullet, and a custom `characterCode` was ignored when combined with `type`; both now work.
- Text that already began with a bullet glyph (e.g. `addText("• item", { bullet: true })`) rendered a double bullet; the leading glyph is now stripped when bullets are enabled.
- Non-numeric table-cell `margin` values leaked `NaN` into the cell margins; invalid margins now fall back to defaults.
- Lines drawn "backwards" (with a negative width or height) produced invalid output; they are now normalized to positive sizes using horizontal/vertical flip flags.
- Presentation elements were written in a non-standard order; the notes-master list now precedes the slide list to match the OOXML specification.

### Changed

- `npm test` now runs both the regression suite and the OOXML schema-validation suite. Schema validation requires a one-time `./tools/ooxml-validator/install.sh` to download the validator binary.

## [4.0.1](https://github.com/gitbrent/PptxGenJS/releases/tag/v4.0.1) - 2025-06-25

### Fixed

- Border is a string instead of a number in demo_tables.mjs [\#1389](https://github.com/gitbrent/PptxGenJS/issues/1389) ([hesi726](https://github.com/hesi726))
- Fixed support for Scheme Colors as `dataBorder` [\#1389](https://github.com/gitbrent/PptxGenJS/issues/1389) ([hesi726](https://github.com/hesi726))
- Hyperlinks cause "needs repair" when using table auto-paging [\#1392](https://github.com/gitbrent/PptxGenJS/issues/1392) ([gitbrent](https://github.com/gitbrent))

### Changed

- Removed "node:fs/promises" from `package.json` browser field ([gitbrent](https://github.com/gitbrent))
- Updated image-size to v1.2.1 [\#1387](https://github.com/gitbrent/PptxGenJS/pull/1387) ([znew711](https://github.com/znew711))

## [4.0.0](https://github.com/gitbrent/PptxGenJS/releases/tag/v4.0.0) - 2025-05-04

### Fixed

- defineSlideMaster() issues when reusing config object [\#406](https://github.com/gitbrent/PptxGenJS/issues/406) ([ronnyroeller](https://github.com/ronnyroeller))
- Fixed "needs repair" issue with table auto-paging [\#1380](https://github.com/gitbrent/PptxGenJS/issues/1380) ([gitbrent](https://github.com/gitbrent))

### Added

- Added `textDirection` property for text and table cells to allow vertical rotation of text ([gitbrent](https://github.com/gitbrent))

### Changed

- Bump jszip to ^3.10.1 [\#1255](https://github.com/gitbrent/PptxGenJS/pull/1255) ([NateRadebaugh](https://github.com/NateRadebaugh))
- Added `exports` field to package.json to enable modern module resolution ([gitbrent](https://github.com/gitbrent))
- Brand new logic for detecting Node.js ([gitbrent](https://github.com/gitbrent)) this fixes: Vite issues [\#1325](https://github.com/gitbrent/PptxGenJS/issues/1325) and Web Worker issues [\#1354](https://github.com/gitbrent/PptxGenJS/issues/1354)

### Deps, Demos, Tools, and Docs

- Added new vite-demo under "demos" to test using the library as a module in modern apps (replaces react-demo) ([gitbrent](https://github.com/gitbrent))
- Major updates to dev dependencies (typescript, rollup, eslint, gulp) ([gitbrent](https://github.com/gitbrent))
- Brand new eslint.config.js ([gitbrent](https://github.com/gitbrent))
- Updated rollup.config.mjs ([gitbrent](https://github.com/gitbrent))
- Brand new Vite demo replaces broken CRA react-demo ([gitbrent](https://github.com/gitbrent))
- Brand new WebWorker demo ([gitbrent](https://github.com/gitbrent))
- Major update to README ([gitbrent](https://github.com/gitbrent))
- New TESTING.md document created, renamed RELEASES.md to RELEASING.md ([gitbrent](https://github.com/gitbrent))
- Major update to browser demo page ([gitbrent](https://github.com/gitbrent))
- Major update to GitHub pages doc site ([gitbrent](https://github.com/gitbrent))
- Updated Data2Slides tool to modern bootstrap ([gitbrent](https://github.com/gitbrent))

### Removed

- Removed `react-demo` under demos ([gitbrent](https://github.com/gitbrent))

## [3.12.0](https://github.com/gitbrent/PptxGenJS/releases/tag/v3.12.0) - 2023-03-19

### Added

- Added selecting round or square line cap on line charts [\#1126](https://github.com/gitbrent/PptxGenJS/pull/1126) ([mathbruyen](https://github.com/mathbruyen))
- Added `newAutoPagedSlides` method to `slide` (resolves issue #625) [\#1133](https://github.com/gitbrent/PptxGenJS/pull/1133) ([mikemeerschaert](https://github.com/mikemeerschaert))
- Added optional image shadow props [\#1147](https://github.com/gitbrent/PptxGenJS/pull/1147) ([seekuehe](https://github.com/seekuehe))
- Added ability to set default fontFace [\#1158](https://github.com/gitbrent/PptxGenJS/issues/1158) ([matt88120](https://github.com/matt88120))

### Fixed

- Fixed `autoPage` duplicates text when text array is used [\#1139](https://github.com/gitbrent/PptxGenJS/issues/1139) ([mikemeerschaert](https://github.com/mikemeerschaert))
- PowerPoint shows the "repair" dialog when adding an SVG image to a slide master [\#1150](https://github.com/gitbrent/PptxGenJS/issues/1150) ([BenHall-1](https://github.com/BenHall-1))
- Fixed gh-pages text api docs: transparency + wrap [\#1153](https://github.com/gitbrent/PptxGenJS/pull/1153) ([tjinauyeung](https://github.com/tjinauyeung))
- Fixed YouTube videos not working [\#1156](https://github.com/gitbrent/PptxGenJS/issues/1156) ([gitbrent](https://github.com/gitbrent))
- Fixed handle `holeSize=0` for doughnut chart [\#1180](https://github.com/gitbrent/PptxGenJS/pull/1180) ([mathbruyen](https://github.com/mathbruyen))
- Fixed 3D chart options not working correctly (and updated demo) ([gitbrent](https://github.com/gitbrent))

### Changed

- (Internal) migrate library from tslint to eslint [\#1155](https://github.com/gitbrent/PptxGenJS/pull/1155) ([gitbrent](https://github.com/gitbrent))

## [3.11.0] - 2022-08-06

### Added

- Added category crosses at property (`catAxisCrossesAt`) [\#966](https://github.com/gitbrent/PptxGenJS/pull/966) ([parvezapathan](https://github.com/parvezapathan))
- Added support for multi-level category axes [\#1012](https://github.com/gitbrent/PptxGenJS/pull/1012) ([MariusOpeepl](https://github.com/MariusOpeepl))
- Added 2 new Chart props: `plotArea` and `chartArea` allowing fill and border for each (`plotArea` deprecates `fill` and `border`) [\#1015](https://github.com/gitbrent/PptxGenJS/issues/1015) ([hvstaden](https://github.com/hvstaden))
- Added serie name on bubble chart, category axis position, leader lines on bubble chart [\#1100](https://github.com/gitbrent/PptxGenJS/pull/1100) ([mathbruyen](https://github.com/mathbruyen))
- Added `bubble3D` chart type [\#1108](https://github.com/gitbrent/PptxGenJS/pull/1108) ([mathbruyen](https://github.com/mathbruyen))
- Added new tool under demos: `data_convert` which turns Excel (tab-delim) data to chart data type easily ([gitbrent](https://github.com/gitbrent))

### Fixed

- Using `addImage()` with uppercase path prop causes "needs to repair presentation" [\#860](https://github.com/gitbrent/PptxGenJS/issues/860) ([mamodo123](https://github.com/mamodo123))
- Chart with lines and bars produces repair file dialog in Powerpoint [\#1013](https://github.com/gitbrent/PptxGenJS/issues/1013) ([kornarakis](https://github.com/kornarakis))
- Bubble Charts limited to 26 columns [\#1076](https://github.com/gitbrent/PptxGenJS/issues/1076) ([benjaminpavone](https://github.com/benjaminpavone))
- Using `addImage` with `tableToSlides()` does not work [\#1103](https://github.com/gitbrent/PptxGenJS/issues/1103) ([Strawberry0215](https://github.com/Strawberry0215))
- escape object name in chart xml [\#1122](https://github.com/gitbrent/PptxGenJS/pull/1122) ([mathbruyen](https://github.com/mathbruyen))
- Several issues with charts embedded Excel sheets that prevented "Edit Data in Excel" from working ([gitbrent](https://github.com/gitbrent))
- Issue with combo charts secondary axis on wrong side ([gitbrent](https://github.com/gitbrent))
- Issue with chart prop `titlePos` not working ([gitbrent](https://github.com/gitbrent))

### Changed

- react-demo: updated `react-scripts` to v5.0.0 from v4 ([gitbrent](https://github.com/gitbrent))

## [3.10.0] - 2022-04-10

### Added

- Add name (`objectName`) to all core objects [\#1019](https://github.com/gitbrent/PptxGenJS/pull/1019) ([mvecsernyes](https://github.com/mvecsernyes))
- Add image transparency [\#1053](https://github.com/gitbrent/PptxGenJS/pull/1053) ([mmarkelov](https://github.com/mmarkelov))
- Add text transparency [\#1054](https://github.com/gitbrent/PptxGenJS/issues/1054) ([ibrahimovfuad](https://github.com/ibrahimovfuad))

### Fixed

- Radar chart line colors [\#539](https://github.com/gitbrent/PptxGenJS/issues/539) ([pablodicosta](https://github.com/pablodicosta))
- Placeholder definitions missing props [\#987](https://github.com/gitbrent/PptxGenJS/issues/987) ([bigbug](https://github.com/bigbug))
- Charts and media together is causing pptx needs repair error [\#1020](https://github.com/gitbrent/PptxGenJS/issues/1020) ([mvecsernyes](https://github.com/mvecsernyes))
- Adding hyperlink to table cell doesn't work [\#1049](https://github.com/gitbrent/PptxGenJS/issues/1049) ([tbowmo](https://github.com/tbowmo))
- Underline doesn't work in table after update to v3.9.0 [\#1052](https://github.com/gitbrent/PptxGenJS/issues/1052) ([hhq365](https://github.com/hhq365))
- `ImageProps.sizing` props `w`, `h`, `x`, `y` s/b typed `Coord` [\#1065](https://github.com/gitbrent/PptxGenJS/issues/1065) ([Naveencheekoti17](https://github.com/BistroStu))
- `ImageProps.sizing` are type Coord [\#1066](https://github.com/gitbrent/PptxGenJS/pull/1066) ([BistroStu](https://github.com/BistroStu))
- `transparency` doesn't work in table cell [\#1095](https://github.com/gitbrent/PptxGenJS/issues/1095) ([pipipi-pikachu](https://github.com/pipipi-pikachu))

## [3.9.0] - 2021-12-11

### Added

- Added overlap parameter to bar charts [\#1010](https://github.com/gitbrent/PptxGenJS/pull/1010) ([Norfaer](https://github.com/Norfaer))
- Slide number can now be set as bold [\#1016](https://github.com/gitbrent/PptxGenJS/pull/1016) ([mathbruyen](https://github.com/mathbruyen))
- Added media cover images & file extensions; media is reused now (same file only loaded/written once) [\#1024](https://github.com/gitbrent/PptxGenJS/pull/1024) ([canwdev](https://github.com/canwdev))

### Fixed

- Use `encodeXmlEntities()` for formatCode attributes [\#955](https://github.com/gitbrent/PptxGenJS/pull/955) ([dimfeld](https://github.com/dimfeld))
- SlideNumber vertical alignment (`valign`) not working [\#1000](https://github.com/gitbrent/PptxGenJS/pull/1000) ([kramsram](https://github.com/kramsram))
- Fix for InvertedColors (Issue #970) [\#1004](https://github.com/gitbrent/PptxGenJS/pull/1004) ([leonyah](https://github.com/leonyah))
- PPT repair issue for long text [\#1008](https://github.com/gitbrent/PptxGenJS/issues/1008) ([Naveencheekoti17](https://github.com/Naveencheekoti17)), fixed via [\#1028](https://github.com/gitbrent/PptxGenJS/pull/1028) ([gitbrent](https://github.com/gitbrent))
- Doughnut chart: each data marker as a different color [\#1017](https://github.com/gitbrent/PptxGenJS/pull/1017) ([mathbruyen](https://github.com/mathbruyen))

### Changed

- React Demo: updated to latest create-react-app ([gitbrent](https://github.com/gitbrent))

## [3.8.0] - 2021-09-28

### Added

- Table auto-paging completely re-written from scratch; finally handles complex-text (text runs) [\#993](https://github.com/gitbrent/PptxGenJS/pull/993) ([gitbrent](https://github.com/gitbrent))

### Changed

- Browser Demo: refreshed UI and upgraded to bootstrap-5 [\#997](https://github.com/gitbrent/PptxGenJS/pull/997) ([gitbrent](https://github.com/gitbrent))
- Documentation site (gh-pages) rebuilt from scratch [\#999](https://github.com/gitbrent/PptxGenJS/pull/999) ([gitbrent](https://github.com/gitbrent))

## [3.7.1] - 2021-07-21

### Fixed

- Added missing `altText` prop to ImageProps [\#848](https://github.com/gitbrent/PptxGenJS/pull/848) ([yorch](https://github.com/yorch))

## [3.7.0] - 2021-07-20

### Added

- Alt Text to images [\#848](https://github.com/gitbrent/PptxGenJS/pull/848) ([yorch](https://github.com/yorch))
- Custom geometry support (freeform) [\#872](https://github.com/gitbrent/PptxGenJS/pull/872) ([apresmoi](https://github.com/apresmoi))
  - Resolves:
    - Custom polygon generation [\#597](https://github.com/gitbrent/PptxGenJS/issues/597) ([hirenj](https://github.com/hirenj))
    - Is there any way to draw a bell curve shape? [\#946](https://github.com/gitbrent/PptxGenJS/issues/946) ([gurdeep-sourcefuse](https://github.com/gurdeep-sourcefuse))

### Fixed

- Background in master template broken (support multiple `background` props) [\#968](https://github.com/gitbrent/PptxGenJS/issues/968) ([viral-sh](https://github.com/viral-sh))
- Arguments for radius not allowed in TypeScript for rectangles [\#969](https://github.com/gitbrent/PptxGenJS/issues/969) ([ln56b](https://github.com/ln56b))
- Documentation: `catAxisLine*` and `valAxisLine*` props missing [\#980](https://github.com/gitbrent/PptxGenJS/issues/980) ([ln56b](https://github.com/hhq365))

### Chart Updates

Comprehensive Pull

- Multiple Chart Enhancements and Bugfixes [\#938](https://github.com/gitbrent/PptxGenJS/pull/938) ([ReimaFrgos](https://github.com/ReimaFrgos))
  - Resolves:
    - Using scheme colors and fonts in chart axis labels, axis lines and series labels #858 [robertedjones]
    - dataLabelPosition option for Pie charts #837 [kornarakis]
    - Bubble chart catAxisMajorUnit not working #747 [dscdngnw]
    - dataLabelFontBold option not working as expected. #662 [belall-shaikh]
    - dataLabelPosition is not working in Multi Type Charts #815 [Adt-SakshamSethi]
    - dataLabelPosition "t" in Bar chart is crashing ppt in latest MS office Power Point #788 [jsvishal]
    - Setting dataLabelPosition to a line chart causes latest office application to ask for repair #768 [artdomg]

## [3.6.0] - 2021-05-02

### Release Summary

- **Major Update**: demo code (they're all .mjs modules now!); dropped support for IE11 (RIP!) in demo app.
- **IE11 Note**: Dropped support for IE11 (use v3.5.0 or below) (library still works with IE11 using polyfill)

### Added

- Alt Text to charts [\#848](https://github.com/gitbrent/PptxGenJS/pull/848) ([yorch](https://github.com/yorch))
- Tab Stops to Text objects [\#853](https://github.com/gitbrent/PptxGenJS/pull/853) ([wangfengming](https://github.com/wangfengming))
- Text Highlight to Text objects [\#857](https://github.com/gitbrent/PptxGenJS/pull/857) ([wangfengming](https://github.com/wangfengming))
- Transparency to line [\#889](https://github.com/gitbrent/PptxGenJS/pull/889) ([mmarkelov](https://github.com/mmarkelov))
- Transparency to slide [\#891](https://github.com/gitbrent/PptxGenJS/pull/891) ([mmarkelov](https://github.com/mmarkelov))

### Changed

- Website/Docs Docusaurus v2.0; major UI facelift [\#931](https://github.com/gitbrent/PptxGenJS/pull/931) ([gitbrent](https://github.com/gitbrent))

### Deprecated

- Slide.fill (`BackgroundProps`) - use `ShapeFillProps` instead

### Removed

- Browser Demo: Dropped support for IE11 (use v3.5.0 or below) (library still works with IE11 using polyfill)

### Fixed

- Margin not working with placeholder text [\#640](https://github.com/gitbrent/PptxGenJS/issues/640) ([bestis](https://github.com/bestis))
- Cant create a list of bulleted links in a table cell [\#763](https://github.com/gitbrent/PptxGenJS/issues/763) ([avillamaina](https://github.com/avillamaina))
- Small API documentation glitch [\#895](https://github.com/gitbrent/PptxGenJS/issues/895) ([Slidemagic](https://github.com/Slidemagic))
- pptx.stream() WriteBaseProps should be optional [\#932](https://github.com/gitbrent/PptxGenJS/issues/932) ([arbourd](https://github.com/arbourd))
- Running StdTests generate a corrupt PPT [\#937](https://github.com/gitbrent/PptxGenJS/issues/937) ([michaeltford](https://github.com/michaeltford))
- addNotes function adding notes as an array of objects, parsed as [object Object] in notes field [\#941](https://github.com/gitbrent/PptxGenJS/issues/941) ([karlolsonuc](https://github.com/karlolsonuc))

## [3.5.0] - 2021-03-30

### Release Summary

- write()/writeFile() method string arguments are deprecated - props object in now the sole arg (`WriteProps`/`WriteFileProps`)

### Added

- Enabled JSZip compression [\#713](https://github.com/gitbrent/PptxGenJS/issues/713) ([pimlottc-gov](https://github.com/pimlottc-gov))
- Soft line break property: `softBreakBefore` [\#806](https://github.com/gitbrent/PptxGenJS/pull/806) ([memorsolutions](https://github.com/memorsolutions))
- More text styles: underline/strike/baseline [\#854](https://github.com/gitbrent/PptxGenJS/pull/854) ([wangfengming](https://github.com/wangfengming))
- Support line spacing by multiple: `lineSpacingMultiple` [\#855](https://github.com/gitbrent/PptxGenJS/pull/855) ([wangfengming](https://github.com/wangfengming))
- Chart val axis option: logarithmic scale base: `valAxisLogScaleBase` [\#878](https://github.com/gitbrent/PptxGenJS/issues/878) ([rkspx](https://github.com/rkspx))

### Changed

- Fixed: Setting the "Wrap text in shape" option [\#771](https://github.com/gitbrent/PptxGenJS/issues/771) ([CroniD](https://github.com/CroniD))
- Fixed: `dataLabelFormatCode` option creates corrupted file if the value includes quotes [\#834](https://github.com/gitbrent/PptxGenJS/issues/834) ([kornarakis](https://github.com/kornarakis)) [\#884](https://github.com/gitbrent/PptxGenJS/pull/884) ([gazlo](https://github.com/gazlo))
- Fixed: Improve typescipt defs: fix dupes, etc [\#886](https://github.com/gitbrent/PptxGenJS/pull/886) ([mmarkelov](https://github.com/mmarkelov))
- Fixed: Wrong type definition for placeholder type property [\#921](https://github.com/gitbrent/PptxGenJS/issues/921) ([lukevella](https://github.com/lukevella))

### Internal Updates

- Doc/Website Updates: Docusaurus docs and website updated to v2.0 [\#924](https://github.com/gitbrent/PptxGenJS/pull/924) ([gitbrent](https://github.com/gitbrent))

## [3.4.0] - 2021-01-03

### Added

- Added: `firstSliceAngle` (Pie, Doughnut charts) [\#666](https://github.com/gitbrent/PptxGenJS/issues/666) ([ghost](https://github.com/ghost)) [\#809](https://github.com/gitbrent/PptxGenJS/pull/809) ([cronin4392](https://github.com/cronin4392))
- Added: Ability to change hyperlink `color` [\#389](https://github.com/gitbrent/PptxGenJS/issues/389) ([szilagyikinga](https://github.com/szilagyikinga)) [\#793](https://github.com/gitbrent/PptxGenJS/pull/793) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Added: Horizontal/Vertical flip capability to images [\#824](https://github.com/gitbrent/PptxGenJS/pull/824) ([luism-s](https://github.com/luism-s))
- Added: New `titleBold` option on chart settings [\#830](https://github.com/gitbrent/PptxGenJS/pull/830) ([twatson83](https://github.com/twatson83))
- Added: New cat/val-AxisLineColor/AxisLineSize/AxisLineStyle chart options [\#831](https://github.com/gitbrent/PptxGenJS/pull/831) ([twatson83](https://github.com/twatson83))
- Added: New shape options: `angleRange` and `arcThicknessRatio` [\#547](https://github.com/gitbrent/PptxGenJS/issues/547) ([paolochiodi](https://github.com/paolochiodi)) [\#861](https://github.com/gitbrent/PptxGenJS/pull/861) ([apresmoi](https://github.com/apresmoi))

### Changed

- Fixed: catAxisLabelPos and valAxisLabelPos options are not working [\#709](https://github.com/gitbrent/PptxGenJS/issues/709) ([cpf121](https://github.com/cpf121))
- Fixed: logic for dataLabelFormat code in Pie and Donut charts [\#802](https://github.com/gitbrent/PptxGenJS/pull/802) ([cronin4392](https://github.com/cronin4392))
- Fixed: data label position for Pie chart [\#808](https://github.com/gitbrent/PptxGenJS/pull/808) ([cronin4392](https://github.com/cronin4392))
- Fixed: Single data set with a custom color should not create legends for each category [\#821](https://github.com/gitbrent/PptxGenJS/issues/821) ([tvt](https://github.com/tvt))
- Fixed: bug when evaluating `catAxisLabelPos`,`valAxisLabelPos` props [\#829](https://github.com/gitbrent/PptxGenJS/pull/829) ([twatson83](https://github.com/twatson83))
- Fixed: secondary axis param (`secondaryValAxis`) check [\#832](https://github.com/gitbrent/PptxGenJS/pull/832) ([twatson83](https://github.com/twatson83))
- Fixed: `addSection` method missing return type in `index.d.ts` [\#833](https://github.com/gitbrent/PptxGenJS/issues/833) ([dylang](https://github.com/dylang))
- Fixed: Align property doesn't work in slide number object [\#835](https://github.com/gitbrent/PptxGenJS/issues/835) ([ax2mx](https://github.com/ax2mx))
- Fixed: Margin doesn't work in slide number object [\#836](https://github.com/gitbrent/PptxGenJS/issues/836) ([ax2mx](https://github.com/ax2mx))
- Fixed: several rounding mistakes for precision, accuracy, and usability [\#840](https://github.com/gitbrent/PptxGenJS/pull/840) ([michaelcbrook](https://github.com/michaelcbrook))
- Fixed: catAxisMinorTickMark [\#841](https://github.com/gitbrent/PptxGenJS/pull/841) ([twatson83](https://github.com/twatson83))
- Fixed: colspan/rowspan [\#852](https://github.com/gitbrent/PptxGenJS/pull/852) ([wangfengming](https://github.com/wangfengming))
- Fixed: typo in ts doc [\#873](https://github.com/gitbrent/PptxGenJS/issues/873) ([jencii](https://github.com/jencii))
- Fixed: TypeError: Cannot set property 'lIns' of undefined [\#879](https://github.com/gitbrent/PptxGenJS/issues/879) ([CroniD](https://github.com/CroniD))

### Internal Updates

- Library Updates: TypeScript 4, Rollup 2.3 and more [\#866](https://github.com/gitbrent/PptxGenJS/pull/866) ([gitbrent](https://github.com/gitbrent))

## [3.3.1] - 2020-08-23

### Changed

- Fixed: Broken pptx has generated if used custom slide layout in v3.3.0 [\#826](https://github.com/gitbrent/PptxGenJS/issues/826) ([yhatt](https://github.com/yhatt))
- Fixed: lineSpacing option set to decimal triggers repair alert [\#827](https://github.com/gitbrent/PptxGenJS/issues/827) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Updated `demos.js` to replace all fill:string with fill:ShapeFillProps ([gitbrent](https://github.com/gitbrent))

## [3.3.0] - 2020-08-16

### Major Change Summary

- The `addTable()` method finally supports auto-paging, including support for repeating table headers!
- The `addText()` method text layout engine has been rewritten from scratch and handles every type of layout case now
- New `addText()` `fit` option ('none' | 'shrink' | 'resize') addresses long-standing issues with shrink/resize objects (new demo page as well)
- Fix for Angular "`Buffer` is unknown" issue
- Major update of typescript defs, including tons of documentation that has been added
- Unfotunately, `fill` no longer accepts a plain string and there was no smooth way to make that backwards compatible (sorry!)

### BREAKING CHANGES

- **TypeScript users**: `fill` property no longer accepts strings, only `ShapeFill` type now (sorry!)
- **All users**: table and textbox text linebreaks may act differently! (a major rewrite to correct long-standing issues with alignment/breakLine finally landed)

### Added

- Added: Auto-Paging finally comes to `addTable()` [\#262](https://github.com/gitbrent/PptxGenJS/issues/262) ([okaiyong](https://github.com/okaiyong))
- Added: Chart DataTable formatting `dataTableFormatCode` and `valLabelFormatCode` [\#489](https://github.com/gitbrent/PptxGenJS/issues/489) ([phobos7000](https://github.com/phobos7000)) [\#684](https://github.com/gitbrent/PptxGenJS/pull/684) ([hanzi](https://github.com/hanzi))
- Added: Background image for slides (deprecated `bkgd:string` with `background:BkgdOpts`) [\#610](https://github.com/gitbrent/PptxGenJS/pull/610) ([thomasowow](https://github.com/thomasowow))
- Added: `shapeName` to objects instead of default [\#724](https://github.com/gitbrent/PptxGenJS/issues/724) ([Offbeatmammal](https://github.com/Offbeatmammal))
- Added: `valAxisDisplayUnitLabel` option [\#765](https://github.com/gitbrent/PptxGenJS/pull/765) ([hysh](https://github.com/hysh))
- Added: Ability to create a hyperlink on a shape [\#767](https://github.com/gitbrent/PptxGenJS/issues/767) ([CroniD](https://github.com/CroniD))

### Changed

- Fixed: complete rewrite of genXmlTextBody for new text run/paragraph generation. Fixes: [\#369](https://github.com/gitbrent/PptxGenJS/issues/369)
  [\#448](https://github.com/gitbrent/PptxGenJS/issues/448), [\#460](https://github.com/gitbrent/PptxGenJS/issues/460), [\#751](https://github.com/gitbrent/PptxGenJS/issues/751), [\#772](https://github.com/gitbrent/PptxGenJS/pull/772)
- Fixed: tableToSlides `addHeaderToEach` finally duplicates all header rows, not just the first one [\#262](https://github.com/gitbrent/PptxGenJS/issues/262) ([okaiyong](https://github.com/okaiyong))
- Fixed `colW` length mismatch with colspans (Issue #651) [\#679](https://github.com/gitbrent/PptxGenJS/issues/679) ([Joshua-rose](https://github.com/Joshua-rose))
- Fixed: hyperlink and tooltip property `rId` is not working? [\#758](https://github.com/gitbrent/PptxGenJS/issues/758) ([kuldeept70](https://github.com/kuldeept70))
- Fixed: removed old/unused options from demo [\#759](https://github.com/gitbrent/PptxGenJS/pull/759) ([sijmenvos](https://github.com/sijmenvos))
- Fixed: removed `Buffer` type from `index.ts.d` [\#761](https://github.com/gitbrent/PptxGenJS/pull/761) ([lustigerlurch551](https://github.com/lustigerlurch551))
- Fixed: addSection does not escape XML unsafe characters [\#774](https://github.com/gitbrent/PptxGenJS/issues/774) ([pimlottc-gov](https://github.com/pimlottc-gov))
- Fixed: Multiple Border Types not supported in Table Cell [\#775](https://github.com/gitbrent/PptxGenJS/issues/775) ([jsvishal](https://github.com/jsvishal))
- Fixed: New ITextOpts `fit` prop, removed `autoFit`/`shrinkText`, new demo slide [\#779](https://github.com/gitbrent/PptxGenJS/issues/779) ([DonnaZukowskiPfizer](https://github.com/DonnaZukowskiPfizer)) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Fixed: EMU calculations are not safe (calcPointValue in gen-xml) [\#781](https://github.com/gitbrent/PptxGenJS/issues/781) ([CroniD](https://github.com/CroniD))
- Fixed: type defs for `TableCell.text` not correct ([gitbrent](https://github.com/gitbrent))
- Fixed: type defs for `ITableOptions` s/b `TableOptions` ([gitbrent](https://github.com/gitbrent))

## [3.2.1] - 2020-05-25

### Added

### Changed

- Fixed: `addTable`, `addText`, etc. not working properly inside tableToSlides [\#715](https://github.com/gitbrent/PptxGenJS/issues/715) ([Smithvinayakiya](https://github.com/Smithvinayakiya))
- Fixed: Issue links in release notes are broken [\#749](https://github.com/gitbrent/PptxGenJS/issues/749) ([pimlottc-gov](https://github.com/pimlottc-gov))
- Fixed: Type defs were missing ISlideMasterOptions `text` prop and `slideNumber` align ([gitbrent](https://github.com/gitbrent))
- Fixed: Type defs misspelled `rowW` s/b `rowH` ([gitbrent](https://github.com/gitbrent))
- Fixed: Documentation: Corrected max value for `barGapWidthPct` ([gitbrent](https://github.com/gitbrent))

## [3.2.0] - 2020-05-17

### Added

- Added: New chart type: Stacked Area Charts [\#333](https://github.com/gitbrent/PptxGenJS/issues/333) ([fordaaronj](https://github.com/fordaaronj))
- Added: Sections can now be created [\#349](https://github.com/gitbrent/PptxGenJS/issues/349) ([atulsingh0913](https://github.com/atulsingh0913))
- Added: New bullet option `marginPt` to control left indent margin [\#504](https://github.com/gitbrent/PptxGenJS/issues/504) ([Cyan005](https://github.com/Cyan005))

### Changed

- Fixed: Placeholder type Body is defaulting in a hanging indent [\#589](https://github.com/gitbrent/PptxGenJS/issues/589) ([colmben](https://github.com/colmben))
- Fixed: Text in slides does not override the bullet master [\#620](https://github.com/gitbrent/PptxGenJS/pull/620) ([sgenoud](https://github.com/sgenoud))
- Fixed: Type errors in `index.d.ts` [\#672](https://github.com/gitbrent/PptxGenJS/issues/672) ([Krishnakanth94](https://github.com/Krishnakanth94))
- Fixed: Typescript defs Slide and ISlide [\#673](https://github.com/gitbrent/PptxGenJS/issues/673) ([gytisgreitai](https://github.com/gytisgreitai))
- Fixed: Spelling consistent "Presenation" -> "Presentation" typo [\#694](https://github.com/gitbrent/PptxGenJS/pull/694) ([ankon](https://github.com/ankon))
- Fixed: Handle errors with promise rejections [\#695](https://github.com/gitbrent/PptxGenJS/pull/695) ([ankon](https://github.com/ankon))
- Fixed: Update 'pptx' to 'pres' in README.md [\#700](https://github.com/gitbrent/PptxGenJS/pull/700) ([lucidlemon](https://github.com/lucidlemon))
- Fixed: Time units validation [\#706](https://github.com/gitbrent/PptxGenJS/pull/706) ([lucasflomuller](https://github.com/lucasflomuller))
- Fixed: Add the slide layout name to the generated background image name [\#726](https://github.com/gitbrent/PptxGenJS/pull/726) ([jrohland](https://github.com/jrohland))
- Fixed: Type issue addTable rows, updated TableCell/TableRow [\#735](https://github.com/gitbrent/PptxGenJS/issues/735) ([robertsoaa](https://github.com/robertsoaa))
- Continued improvement of typescript definitions file ([gitbrent](https://github.com/gitbrent))

## [3.1.1] - 2020-02-02

### Added

- TypeScript: Add shapes and font options types [\#650](https://github.com/gitbrent/PptxGenJS/pull/650) ([cronin4392](https://github.com/cronin4392))
- TypeScript: Added correct export of types and ts-def file (`pptx.ShapeType.rect`, etc) in `index.d.ts` ([gitbrent](https://github.com/gitbrent))

### Changed

- Fixed: Re-added "browser" property to `package.json` to avoid old "fs not found" Angular/webpack issue (Angular 8) [\#654](https://github.com/gitbrent/PptxGenJS/issues/654) ([cwilkens](https://github.com/cwilkens))
- Fixed: Previous release introduced a regression bug and broke addTest placeholder's ([gitbrent](https://github.com/gitbrent))
- Fixed: addChart and addImage in the same slide cause an error [fixed via `getNewRelId`] [\#655](https://github.com/gitbrent/PptxGenJS/issues/655) ([JuliaSheleva](https://github.com/JuliaSheleva))

### Removed

- The `core-shapes.ts` file was removed, shape def collapsed to simple type array, rolled into `core-enums.ts` and `index.d.ts` ([gitbrent](https://github.com/gitbrent))

## [3.1.0] - 2020-01-21

### Added

- Added `valAxisDisplayUnit` [\#606](https://github.com/gitbrent/PptxGenJS/pull/606) ([AmrutPatil](https://github.com/AmrutPatil))
- Added `dataTableFontSize` chart option [\#622](https://github.com/gitbrent/PptxGenJS/pull/622) ([MehdiAroui](https://github.com/MehdiAroui))
- Added text `glow` option [\#630](https://github.com/gitbrent/PptxGenJS/pull/630) ([kevinresol](https://github.com/kevinresol))
- Ability to `rotate` image [\#639](https://github.com/gitbrent/PptxGenJS/pull/639) ([alabaki](https://github.com/alabaki))
- Include types in package.json files [\#641](https://github.com/gitbrent/PptxGenJS/pull/641) ([cronin4392](https://github.com/cronin4392))
- Added `showLeaderLines` chart option [\#642](https://github.com/gitbrent/PptxGenJS/pull/642) ([cronin4392](https://github.com/cronin4392))

### Changed

- Fixed: Empty color negative values on barchart [\#285](https://github.com/gitbrent/PptxGenJS/issues/285) ([andrei-cs](https://github.com/andrei-cs)) ([Slidemagic](https://github.com/Slidemagic))
- Fixed: Add missing margin type from ITextOpts [\#643](https://github.com/gitbrent/PptxGenJS/pull/643) ([cronin4392](https://github.com/cronin4392))
- Fixed: Scatter plot `dataLabelPosition` [\#644](https://github.com/gitbrent/PptxGenJS/issues/644) ([afarghaly10](https://github.com/afarghaly10))
- Fixed: Added new babel polyfill for IE11; other IE11 fixes in demo, etc. [\#648](https://github.com/gitbrent/PptxGenJS/issues/648) ([YakQin](https://github.com/YakQin))
- Updated Demo: added support for light/dark mode; new Image slide for rotation; new busy progress modal ([gitbrent](https://github.com/gitbrent))

### Removed

- Removed: jsdom pkg is no longer a dependency in `package.json` ([gitbrent](https://github.com/gitbrent))

## [3.0.1] - 2020-01-07

### Changed

- Fixed: JSZip not found under Node.js [\#638](https://github.com/gitbrent/PptxGenJS/issues/638) ([rse](https://github.com/rse))
- Fixed: react demo fixes and new build for [demo-react online](https://gitbrent.github.io/PptxGenJS/demo-react/index.html) ([gitbrent](https://github.com/gitbrent))
- Fixed: added missing catch on media promise.all to handle 404 media links ([gitbrent](https://github.com/gitbrent))
- Fixed: replaced wikimedia links in common/demos.js with github raw content links ([gitbrent](https://github.com/gitbrent))

## [3.0.0] - 2020-01-01

### Added

- Ability to specify numbered list format [\#452](https://github.com/gitbrent/PptxGenJS/issues/452) ([mayvazyan](https://github.com/mayvazyan))
- New cat/val axis options: majorTickMark/minorTickMark [\#473](https://github.com/gitbrent/PptxGenJS/pull/473) ([RokasDie](https://github.com/RokasDie))
- Ability to set start number "startAt" for a bullet list of type numbered [\#554](https://github.com/gitbrent/PptxGenJS/issues/554) [\#555](https://github.com/gitbrent/PptxGenJS/pull/555) ([bj-mitchell](https://github.com/bj-mitchell))

### Changed

- Fixed: Set proper MIME type for PPTX presentation [\#471](https://github.com/gitbrent/PptxGenJS/issues/471) ([StefanBrand](https://github.com/StefanBrand))
- Fixed: SVG images used to be generated by Node [\#515](https://github.com/gitbrent/PptxGenJS/issues/515) ([michaelcbrook](https://github.com/michaelcbrook))
- Fixed: SVG support has several issues [\#528](https://github.com/gitbrent/PptxGenJS/pull/528) ([RicardoNiepel](https://github.com/RicardoNiepel))
- Fixed: Downloading PPT in iOS using Safari does not work. File named as UNKNOWN. [\#540](https://github.com/gitbrent/PptxGenJS/issues/540) ([mustafagentrit](https://github.com/mustafagentrit))
- Fixed: Tables not being displayed after update [\#559](https://github.com/gitbrent/PptxGenJS/issues/559) ([emartz404](https://github.com/emartz404))
- Fixed: Hyperlink creates malformed slide if it includes "&" [\#562](https://github.com/gitbrent/PptxGenJS/issues/562) ([Tehnix](https://github.com/Tehnix))
- Fixed: Exporting images corrupting file. [\#578](https://github.com/gitbrent/PptxGenJS/issues/578) ([joeberth](https://github.com/joeberth))
- Fixed: Multiple files getting downloaded if multiple base64 images are added. [\#581](https://github.com/gitbrent/PptxGenJS/issues/581) ([akshaymagapu](https://github.com/akshaymagapu))
- Fixed: Links in tables won't work on tables generated with autoPage [\#583](https://github.com/gitbrent/PptxGenJS/issues/583) ([githuis](https://github.com/githuis))
- Fixed: Added rounding of margin values to avoid invalid XML [\#633](https://github.com/gitbrent/PptxGenJS/pull/633) ([kevinresol](https://github.com/kevinresol))

### Removed

- Removed: jQuery is no longer required (!)

## [2.6.0] - 2019-09-24

### Added

- Host the Examples demo webpage online [\#505](https://github.com/gitbrent/PptxGenJS/pull/505) ([multiplegeorges](https://github.com/multiplegeorges))
- Add types key to package.json [\#529](https://github.com/gitbrent/PptxGenJS/pull/529) ([adamlong5](https://github.com/adamlong5))
- Add support for font family css when export HTML table to slide. [\#571](https://github.com/gitbrent/PptxGenJS/pull/571) ([Jank1310](https://github.com/twatson83))

### Changed

- Fixed: MIME type is ppt now instead of "application/zip"
- Fixed: Not Able to add background image from the www source [\#497](https://github.com/gitbrent/PptxGenJS/issues/497) ([nish25sp](https://github.com/nish25sp))
- Fixed: Set proper MIME type for PPTX presentation [\#471](https://github.com/gitbrent/PptxGenJS/issues/471) ([StefanBrand](https://github.com/StefanBrand))
- Fixed: lineDash Option is not in documentation [\#526](https://github.com/gitbrent/PptxGenJS/issues/526) ([Jank1310](https://github.com/Jank1310))
- Fixed: Downloading PPT in iOS using Safari does not work. File named as UNKNOWN. [\#540](https://github.com/gitbrent/PptxGenJS/issues/540) ([mustafagentrit](https://github.com/mustafagentrit))
- Fixed: ReferenceError: strXmlBullet is not defined [\#587](https://github.com/gitbrent/PptxGenJS/issues/587) ([Saurabh-Chandil](https://github.com/Saurabh-Chandil))
- Fixed: Getting paraPropXmlCore not defined error - line 4200 in pptxgen.bundle.js missing "var" declaration [\#596](https://github.com/gitbrent/PptxGenJS/issues/596) ([rajeearyal](https://github.com/rajeearyal))

### Removed

## [2.5.0] - 2019-02-08

### Added

- Make Shapes available for a front-end usage [\#137](https://github.com/gitbrent/PptxGenJS/issues/137) ([spamforhope](https://github.com/spamforhope))
- Ability to rotate chart axis labels (`catAxisLabelRotate`/`valAxisLabelRotate`) [\#378](https://github.com/gitbrent/PptxGenJS/issues/378) ([teejayvanslyke](https://github.com/teejayvanslyke))
- New Chart Type: 3D bar charts [\#384](https://github.com/gitbrent/PptxGenJS/pull/384) ([loictro](https://github.com/loictro))
- New Chart Feature: Add Data Labels to Scatter Charts [\#420](https://github.com/gitbrent/PptxGenJS/pull/420) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Add new chart options: `catAxisLabelFontBold`,`dataLabelFontBold`,`legendFontFace`,`valAxisLabelFontBold` [\#426](https://github.com/gitbrent/PptxGenJS/issues/426) ([BandaSatish07](https://github.com/BandaSatish07))
- Add missing jpg content type to fix corrupt presentation for Office365 [\#435](https://github.com/gitbrent/PptxGenJS/pull/435) ([antonandreyev](https://github.com/antonandreyev))
- Add `catAxisMinVal` and `catAxisMaxVal` [\#462](https://github.com/gitbrent/PptxGenJS/pull/462) ([vrimar](https://github.com/vrimar))
- New Chart Option: `valAxisCrossesAt` [\#474](https://github.com/gitbrent/PptxGenJS/pull/474) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Docs: Show how to save as Blob using client browser [\#478](https://github.com/gitbrent/PptxGenJS/issues/478) ([crazyx13th](https://github.com/crazyx13th))

### Changed

- Fixed: Dynamic Text Options do not apply [\#427](https://github.com/gitbrent/PptxGenJS/issues/427) ([sunnyar](https://github.com/sunnyar))
- Removed: legacy/deprecated attributes from README javascript script tags [\#431](https://github.com/gitbrent/PptxGenJS/pull/431) ([efx](https://github.com/efx))
- Fixed: issue with SlideNumber `fontSize` float values [\#432](https://github.com/gitbrent/PptxGenJS/issues/432) ([efx](https://github.com/efx))
- Fixed: query and fragment from image URL extension [\#433](https://github.com/gitbrent/PptxGenJS/pull/433) ([katsuya-horiuchi](https://github.com/katsuya-horiuchi))
- Changed: Replace "$" with "jQuery" to fix integration issues with some applications [\#436](https://github.com/gitbrent/PptxGenJS/pull/436) ([antonandreyev](https://github.com/antonandreyev))
- Changed: Export more types to enhance TypeScript support [\#443](https://github.com/gitbrent/PptxGenJS/pull/443) ([ntietz](https://github.com/ntietz))
- Fixed: Rounding in percentage leads to small deviations [\#470](https://github.com/gitbrent/PptxGenJS/pull/470) ([Slidemagic](https://github.com/Slidemagic)) [\#475](https://github.com/gitbrent/PptxGenJS/pull/475) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Fixed: Hyperlinks causing duplicate relationship ID when other objects on page [\#477](https://github.com/gitbrent/PptxGenJS/pull/477) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Fixed: ordering of paragraph properties [\#485](https://github.com/gitbrent/PptxGenJS/pull/485) ([sleepylemur](https://github.com/sleepylemur))

### Removed

## [2.4.0] - 2018-10-28

### Added

- Added support for SVG images [\#401](https://github.com/gitbrent/PptxGenJS/pull/401) ([Krelborn](https://github.com/Krelborn))
- Better detection/support for Angular [\#415](https://github.com/gitbrent/PptxGenJS/pull/415) ([antiremy](https://github.com/antiremy))

### Changed

- Demo page converted to Bootstrap 4 [gitbrent](https://github.com/gitbrent)
- Fixed issue with float font-sizes in `addSlidesForTable()` [gitbrent](https://github.com/gitbrent)
- No Color on negative bars when barGrouping is stacked [\#343](https://github.com/gitbrent/PptxGenJS/issues/343)
  ([vanarebane](https://github.com/vanarebane)) [\#419](https://github.com/gitbrent/PptxGenJS/pull/419)
  ([octy40](https://github.com/octy40))
- Improve typescript declaration files [\#409](https://github.com/gitbrent/PptxGenJS/pull/409) ([michaelbeaumont](https://github.com/michaelbeaumont))
- X and Y table coordinates with value of zero ignored [\#411](https://github.com/gitbrent/PptxGenJS/pull/411) ([tovab](https://github.com/tovab))
- Placeholder left align property needs fixing [\#417](https://github.com/gitbrent/PptxGenJS/pull/417) ([raphael-trzpit](https://github.com/raphael-trzpit))
- Replace jquery each by standard forEach [\#418](https://github.com/gitbrent/PptxGenJS/pull/418) ([fdussert](https://github.com/fdussert))
- BugFix: 0 value plot points ignored on Scatter Chart [\#422](https://github.com/gitbrent/PptxGenJS/pull/422) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Pass the callback as a function, rather than invoke it [\#424](https://github.com/gitbrent/PptxGenJS/pull/424) ([danielsiwiec](https://github.com/danielsiwiec))

### Removed

## [v2.3.0](https://github.com/gitbrent/pptxgenjs/tree/v2.3.0) (2018-09-12)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v2.2.0...v2.3.0)

**Highlights:**

- New Feature: Placeholders
- New Feature: Speaker Notes
- `addImage()` can now load both local ("../img.png") and remote images ("<https://wikimedia.org/logo.jpg>")
- Typescript definitions are now available
- `jquery-node` replaced with latest `jquery` package [only affects npm users]

**Fixed Bugs:**

- Remove jquery-node dependency (fixes XSS Vulnerability Security Warning) [\#350](https://github.com/gitbrent/PptxGenJS/issues/350) ([TinkerJack](https://github.com/TinkerJack))
- Cannot set valAxisMinVal to 0 [\#357](https://github.com/gitbrent/PptxGenJS/issues/357) ([GiridharGNair](https://github.com/GiridharGNair))
- Multiple paragraph spacings if newline character occur in text [\#368](https://github.com/gitbrent/PptxGenJS/issues/368) ([vpetzel](https://github.com/vpetzel))
- Rotate working incorrectly [\#370](https://github.com/gitbrent/PptxGenJS/issues/370) ([michaelcbrook](https://github.com/michaelcbrook))
- Removed error thrown while rendering Multi Type chart containing Area [\#371](https://github.com/gitbrent/PptxGenJS/pull/371)
  ([KrishnaTejaReddyV](https://github.com/KrishnaTejaReddyV))
- Bugfix/enhancement for EncodeXML in speaker notes text [\#373](https://github.com/gitbrent/PptxGenJS/pull/373) ([travispwingo](https://github.com/travispwingo))

**Implemented Enhancements:**

- `addImage()` updated with new code allowing both local and remote images to be used (browser and Node). ([gitbrent](https://github.com/gitbrent))
- Typescript definitions have been created for the PptxGenJS API Methods (`pptxgen.d.ts`). ([gitbrent](https://github.com/gitbrent))
- New Feature: Placeholder support in Master Slides [\#359](https://github.com/gitbrent/PptxGenJS/pull/359) ([conbow](https://github.com/conbow))
- New Feature: Speaker Notes [\#239](https://github.com/gitbrent/PptxGenJS/issues/239) [\#361](https://github.com/gitbrent/PptxGenJS/pull/361) ([travispwingo](https://github.com/travispwingo))
- New Chart Option: `displayBlanksAs` [\#365](https://github.com/gitbrent/PptxGenJS/pull/365) ([guipas](https://github.com/guipas))
- New Feature: ability to hide slides [\#367](https://github.com/gitbrent/PptxGenJS/pull/367) ([ReimaFrgos](https://github.com/ReimaFrgos))
- Add second Cat Axis for Scatter and Bubble [\#372](https://github.com/gitbrent/PptxGenJS/pull/372) ([KrishnaTejaReddyV](https://github.com/KrishnaTejaReddyV))
- New Chart Type: Add radar chart implementation [\#386](https://github.com/gitbrent/PptxGenJS/pull/386) ([loictro](https://github.com/loictro))

## [v2.2.0](https://github.com/gitbrent/pptxgenjs/tree/v2.2.0) (2018-06-17)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v2.1.0...v2.2.0)

**Fixed Bugs:**

- Shapes: How to add vertical lines [\#272](https://github.com/gitbrent/PptxGenJS/issues/272) ([simonjcarr](https://github.com/simonjcarr))
- autoFit is missing 'Shrink text on overflow' variation? [\#330](https://github.com/gitbrent/PptxGenJS/issues/330) ([cdutson](https://github.com/cdutson))
- Rowspan, Colspan, and Multi-Row Headers Not Working [\#331](https://github.com/gitbrent/PptxGenJS/pull/331) ([skellman](https://github.com/skellman))([dwright-novetta](https://github.com/dwright-novetta))
- Isolate variables to the local scope [\#334](https://github.com/gitbrent/PptxGenJS/pull/334) ([edvinasbartkus](https://github.com/edvinasbartkus))
- `addMedia` of type='online' not working? [\#335](https://github.com/gitbrent/PptxGenJS/issues/335) ([lndev1](https://github.com/lndev1))
- Fixed Error thrown while rendering Area Chart [\#342](https://github.com/gitbrent/PptxGenJS/pull/342) ([KrishnaTejaReddyV](https://github.com/KrishnaTejaReddyV))
- Fixed Title display on showTitle = false error [\#344](https://github.com/gitbrent/PptxGenJS/pull/344) ([KrishnaTejaReddyV](https://github.com/KrishnaTejaReddyV))
- `getPageNumber()` is missing from the "Slide Methods" documentation [\#353](https://github.com/gitbrent/PptxGenJS/pull/353) ([kumaarraja](https://github.com/kumaarraja))

**Implemented Enhancements:**

- New Feature! `addImage()` and `addMedia()` methods now accept URLs [\#325](https://github.com/gitbrent/PptxGenJS/pull/325) ([gitbrent](https://github.com/gitbrent))
- Make Node detection more robust [\#277](https://github.com/gitbrent/PptxGenJS/issues/277) ([adrianirwin](https://github.com/adrianirwin)) ([DSheffield](https://github.com/DSheffield))
- Updated pptxgenjs-demo files to use CDNs instead of local files ([gitbrent](https://github.com/gitbrent))
- Updated Node.js detection to increase reliability for Angular users et al. ([gitbrent](https://github.com/gitbrent))
- Add `w` and `h` attributes to `slideNumber()` [\#336](https://github.com/gitbrent/PptxGenJS/issues/336) ([s7726](https://github.com/s7726))

## [v2.1.0](https://github.com/gitbrent/pptxgenjs/tree/v2.1.0) (2018-04-02)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v2.0.0...v2.1.0)

**Fixed Bugs:**

- HTML-to-PowerPoint is creating many extra columns with colspan [\#284](https://github.com/gitbrent/PptxGenJS/issues/284) ([svaak](https://github.com/svaak))
- HTML-to-PowerPoint rowspan is not working ([gitbrent](https://github.com/gitbrent))
- Fix docs/examples to use new fontSize, remove unsupported font_size [\#297](https://github.com/gitbrent/PptxGenJS/issues/297) ([pstoll](https://github.com/pstoll))

**Implemented Enhancements:**

- Mis-detecting Existence of Node.js [\#277](https://github.com/gitbrent/PptxGenJS/issues/277) ([adrianirwin](https://github.com/adrianirwin)) ([DSheffield](https://github.com/DSheffield))
- Add Text Outline functionality [\#298](https://github.com/gitbrent/PptxGenJS/issues/298) ([stevenljacobsen](https://github.com/stevenljacobsen))
- Adding rounded corners to images [\#309](https://github.com/gitbrent/PptxGenJS/issues/309) ([hoangpq](https://github.com/hoangpq))

## [v2.0.0](https://github.com/gitbrent/pptxgenjs/tree/v2.0.0) (2018-01-23)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.10.0...v2.0.0)

**BREAKING CHANGES**

- NodeJS instantiation is now standard (see Issue [\#83](https://github.com/gitbrent/PptxGenJS/issues/83) and `examples/nodejs-demo.js`) which now allows new instances/presentations
- (See "Version 2.0 Breaking Changes" in the README for a complete list)

**Fixed Bugs:**

- Master Slide slide number doesn't show using "New Slide" PPT Function [\#229](https://github.com/gitbrent/PptxGenJS/issues/229) ([ineran](https://github.com/ineran))
- Values of 0 (zero) in series are missing in line chart [\#240](https://github.com/gitbrent/PptxGenJS/issues/240) ([andrei-cs](https://github.com/andrei-cs))
- Node: "DeprecationWarning: Calling an asynchronous function without callback is deprecated." [\#252](https://github.com/gitbrent/PptxGenJS/issues/252) ([the-yadu](https://github.com/the-yadu))
- The UP_DOWN_ARROW shape appears to have duplicate keys [\#253](https://github.com/gitbrent/PptxGenJS/issues/253) ([heavysixer](https://github.com/heavysixer))
- Local demo can not run in IE [\#273](https://github.com/gitbrent/PptxGenJS/issues/273) ([IvanTao](https://github.com/IvanTao))

**Implemented Enhancements:**

- Is it possible to link from one slide to another? [\#251](https://github.com/gitbrent/PptxGenJS/issues/251) ([heavysixer](https://github.com/heavysixer))
- Add rot and vert options to text body properties [\#254](https://github.com/gitbrent/PptxGenJS/issues/254) ([level46](https://github.com/level46))
- Add Character Spacing option [\#265](https://github.com/gitbrent/PptxGenJS/issues/265) ([nguyenhuuphuc83](https://github.com/nguyenhuuphuc83))

## [v1.10.0](https://github.com/gitbrent/pptxgenjs/tree/v1.10.0) (2017-11-14)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.9.0...v1.10.0)

**Fixed Bugs:**

- Fixed bug that was preventing 'chartColorsOpacity' from being anything other than 50 percent. ([gitbrent](https://github.com/gitbrent))
- The `newPageStartY` option is not being honored by `addSlidesForTable()` [\#222](https://github.com/gitbrent/PptxGenJS/issues/222) ([shaunvdp](https://github.com/shaunvdp))
- Line chart with one series displays broken [\#225](https://github.com/gitbrent/PptxGenJS/issues/225) ([andrei-cs](https://github.com/andrei-cs))
- The `*AxisLineShow` chart options do not work [\#231](https://github.com/gitbrent/PptxGenJS/pull/231) ([mconlin](https://github.com/mconlin))

**Implemented Enhancements:**

- New chart type: bubble charts [\#208](https://github.com/gitbrent/PptxGenJS/issues/208) ([shrikantbhongade](https://github.com/shrikantbhongade))
- New Chart option: Legend Text Color [\#233](https://github.com/gitbrent/PptxGenJS/issues/233) ([mconlin](https://github.com/mconlin))
- New Text option: `strike` [\#238](https://github.com/gitbrent/PptxGenJS/issues/238) ([adrienco88](https://github.com/adrienco88))

## [v1.9.0](https://github.com/gitbrent/pptxgenjs/tree/v1.9.0) (2017-10-10)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.8.0...v1.9.0)

**Fixed Bugs:**

- Vertical align and line break bug since update [\#79](https://github.com/gitbrent/PptxGenJS/issues/79) ([mirkoint](https://github.com/mirkoint))
- Save callback is not called by client-browser when there are images to encode [\#187](https://github.com/gitbrent/PptxGenJS/issues/187) ([Malangs](https://github.com/Malangs))
- Promise Dependency - TypeError: Promise.all is not a function [\#188](https://github.com/gitbrent/PptxGenJS/issues/188) ([bartolomeu](https://github.com/bartolomeu))
- Default text size in empty cells making row height too big [\#193](https://github.com/gitbrent/PptxGenJS/issues/193) ([mreilaender](https://github.com/mreilaender))
- Fixed issue that included many extraneous tab characters in the table demo lorem-ipsum text (GitBrent)
- Fix chart issue: Entities encoding [\#204](https://github.com/gitbrent/PptxGenJS/pull/204) ([clubajax](https://github.com/clubajax))
- Fix chart issue: val axis [\#205](https://github.com/gitbrent/PptxGenJS/pull/205) ([clubajax](https://github.com/clubajax))
- Fix chart issue: Line chart series colors were not being respected [\#206](https://github.com/gitbrent/PptxGenJS/pull/206) ([kyrrigle](https://github.com/kyrrigle))
- Discrepancy between docs and code regarding setting a slide's background [\#207](https://github.com/gitbrent/PptxGenJS/pull/207) ([msambarino](https://github.com/msambarino))
- Fix chart issue: bar color regression [\#210](https://github.com/gitbrent/PptxGenJS/pull/210) ([clubajax](https://github.com/clubajax))

**Implemented Enhancements:**

- New chart feature: category axis dates [\#149](https://github.com/gitbrent/PptxGenJS/pull/149) ([kyrrigle](https://github.com/kyrrigle))
- New image option: sizing [\#177](https://github.com/gitbrent/PptxGenJS/pull/177) ([kajda90](https://github.com/kajda90))
- New chart option: show Data Table [\#182](https://github.com/gitbrent/PptxGenJS/issues/182) ([akashkarpe](https://github.com/akashkarpe))
- New chart option: catAxisLabelFrequency [\#184](https://github.com/gitbrent/PptxGenJS/pull/184) ([kajda90](https://github.com/kajda90))
- New chart type: XY Scatter [\#192](https://github.com/gitbrent/PptxGenJS/issues/192) ([shaunvdp](https://github.com/shaunvdp))
- Add electron detection to load correct jquery version [\#200](https://github.com/gitbrent/PptxGenJS/issues/200) ([mreilaender](https://github.com/mreilaender))

## [v1.8.0](https://github.com/gitbrent/pptxgenjs/tree/v1.8.0) (2017-09-12)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.7.0...v1.8.0)

**Fixed Bugs:**

- Slide numbers wrap over 99 [\#133](https://github.com/gitbrent/PptxGenJS/issues/133) ([sangramjagtap](https://github.com/sangramjagtap))
- Shadow corrections bugfix [\#136](https://github.com/gitbrent/PptxGenJS/pull/136) ([kajda90](https://github.com/kajda90))
- Negative Chart values throwing error [\#175](https://github.com/gitbrent/PptxGenJS/issues/175) ([shaunvdp](https://github.com/shaunvdp))

**Implemented Enhancements:**

- New chart feature: Bar colors and axis [\#132](https://github.com/gitbrent/PptxGenJS/pull/132) ([clubajax](https://github.com/clubajax))
- New feature: Scheme colors [\#135](https://github.com/gitbrent/PptxGenJS/pull/135) ([kajda90](https://github.com/kajda90))
- New chart feature: lineShadow [\#138](https://github.com/gitbrent/PptxGenJS/pull/138) ([kajda90](https://github.com/kajda90))
- New chart type: Tornado Chart [\#140](https://github.com/gitbrent/PptxGenJS/pull/140) ([clubajax](https://github.com/clubajax))
- New chart feature: layout option [\#141](https://github.com/gitbrent/PptxGenJS/pull/141) ([kajda90](https://github.com/kajda90))
- New chart type: Doughnut Chart [\#142](https://github.com/gitbrent/PptxGenJS/pull/142) ([kyrrigle](https://github.com/kyrrigle))
- New chart options: gridlines and axes [\#143](https://github.com/gitbrent/PptxGenJS/pull/143) ([kajda90](https://github.com/kajda90))
- New chart feature: Axis Titles [\#144](https://github.com/gitbrent/PptxGenJS/pull/144) ([kyrrigle](https://github.com/kyrrigle))
- Optional output type [\#147](https://github.com/gitbrent/PptxGenJS/pull/147) ([kajda90](https://github.com/kajda90))
- New chart options: catAxisLineShow [\#152](https://github.com/gitbrent/PptxGenJS/pull/152) ([amgault](https://github.com/amga))
- New Master Slide Layouts [\#161](https://github.com/gitbrent/PptxGenJS/pull/161) ([kajda90](https://github.com/kajda90))
- Demo page updates [\#164](https://github.com/gitbrent/PptxGenJS/pull/164) ([clubajax](https://github.com/clubajax))
- New chart feature: New Legend/Title Options [\#165](https://github.com/gitbrent/PptxGenJS/pull/165) ([clubajax](https://github.com/clubajax))
- New chart options: Shadows and Transparent Color [\#166](https://github.com/gitbrent/PptxGenJS/pull/166) ([clubajax](https://github.com/clubajax))
- Add no border option to tables [\#169](https://github.com/gitbrent/PptxGenJS/issues/169) ([eddyclock](https://github.com/eddyclock))
- Chart: Escape Labels XML [\#171](https://github.com/gitbrent/PptxGenJS/pull/171) ([kyrrigle](https://github.com/kyrrigle))
- Add new 'lang' text option to enable Chinese Word fonts [\#174](https://github.com/gitbrent/PptxGenJS/issues/174) ([eddyclock](https://github.com/eddyclock))
- Add color validation to createColorElement() [\#178](https://github.com/gitbrent/PptxGenJS/pull/178) ([kajda90](https://github.com/kajda90))

## [v1.7.0](https://github.com/gitbrent/pptxgenjs/tree/v1.7.0) (2017-08-07)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.6.0...v1.7.0)

**Fixed Bugs:**

- Unable to edit data on line chart [\#122](https://github.com/gitbrent/PptxGenJS/issues/122) ([david23zhu](https://github.com/david23zhu))

**Implemented Enhancements:**

- Add charts to Masters/Templates [\#114](https://github.com/gitbrent/PptxGenJS/issues/114) ([yipiha](https://github.com/yipiha))
- Format text as a superscript in a table cell [\#120](https://github.com/gitbrent/PptxGenJS/issues/120) ([aranard](https://github.com/aranard))

## [v1.6.0](https://github.com/gitbrent/pptxgenjs/tree/v1.6.0) (2017-07-17)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.5.0...v1.6.0)

**Fixed Bugs:**

- The width or the height must be an integer not a float [\#29](https://github.com/gitbrent/PptxGenJS/issues/29) ([badlee](https://github.com/badlee))

**Implemented Enhancements:**

- HTTP Stream [\#35](https://github.com/gitbrent/PptxGenJS/issues/35) ([FedeMM](https://github.com/FedeMM))
- Add a 'line spacing' option to addText() [\#104](https://github.com/gitbrent/PptxGenJS/issues/104) ([eddyclock](https://github.com/eddyclock))
- err TypeError: Cannot read property 'text' of undefined [\#106](https://github.com/gitbrent/PptxGenJS/issues/106) ([ninas880025](https://github.com/ninas880025))
- Added bowser support, gulp build of bundle [\#107](https://github.com/gitbrent/PptxGenJS/pull/107) ([santi-git](https://github.com/santi-git))
- Add increase/decrease indent for bullets [\#108](https://github.com/gitbrent/PptxGenJS/issues/108) ([sangramjagtap](https://github.com/sangramjagtap))

## [v1.5.0](https://github.com/gitbrent/pptxgenjs/tree/v1.5.0) (2017-05-26)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.4.0...v1.5.0)

**Fixed Bugs:**

- Hyperlink and font_face problem [\#74](https://github.com/gitbrent/PptxGenJS/issues/74) ([ZouhaierSebri](https://github.com/ZouhaierSebri))
- Can't override margin with 0 [\#78](https://github.com/gitbrent/PptxGenJS/issues/78) ([scottmtraver](https://github.com/scottmtraver))
- Issue with autopage and colspan [\#80](https://github.com/gitbrent/PptxGenJS/issues/80) ([Szymon-dziewonski](https://github.com/Szymon-dziewonski))
- Does not work on Firefox for Mac, no issues on Firefox for windows [\#81](https://github.com/gitbrent/PptxGenJS/issues/81) ([alexanderdevm](https://github.com/alexanderdevm) and [rwhitmore90](https://github.com/rwhitmore90))
- Not a real issue, just a quick README fix [\#88](https://github.com/gitbrent/PptxGenJS/issues/88) ([mirkoint](https://github.com/mirkoint))
- Invalid XML when calling .addText() with empty array [\#89](https://github.com/gitbrent/PptxGenJS/issues/89) ([JimmyTheChimp](https://github.com/JimmyTheChimp))
- Hyperlink and XML entities issue [\#90](https://github.com/gitbrent/PptxGenJS/issues/90) ([ZouhaierSebri](https://github.com/ZouhaierSebri))
- Tooltip option not implemented for image hyperlink [\#91](https://github.com/gitbrent/PptxGenJS/issues/91) ([ZouhaierSebri](https://github.com/ZouhaierSebri))

**Implemented Enhancements:**

- Add ability to create charts [\#51](https://github.com/gitbrent/PptxGenJS/issues/51) ([alagarrk](https://github.com/alagarrk))
- Added image type to shapes to allow images to be placed on top of shapes, added more properties to ppt document [\#53](https://github.com/gitbrent/PptxGenJS/pull/53) ([ericwgreene](https://github.com/ericwgreene))
- Add support for RTL (Right-to-Left) text for Arabic etc. [\#73](https://github.com/gitbrent/PptxGenJS/issues/73) ([vanekar](https://github.com/vanekar))
- Shape line Diagonal [\#75](https://github.com/gitbrent/PptxGenJS/issues/75) ([vanekar](https://github.com/vanekar))
- Add hyperlink to Image [\#77](https://github.com/gitbrent/PptxGenJS/issues/77) ([plopez7](https://github.com/plopez7))
- Adding rounding radius for texts and shapes and dash options for the outline [\#86](https://github.com/gitbrent/PptxGenJS/pull/86) ([ivolazy](https://github.com/ivolazy))

## [v1.4.0](https://github.com/gitbrent/pptxgenjs/tree/v1.4.0) (2017-04-10)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.3.0...v1.4.0)

**Fixed Bugs:**

- Auto Paging does not include master template on additional slides [\#61](https://github.com/gitbrent/PptxGenJS/issues/61) ([tb23911](https://github.com/tb23911))
- Issue calculating the available height for a table using Auto paging [\#64](https://github.com/gitbrent/PptxGenJS/issues/64) ([tb23911](https://github.com/tb23911))
- Multiple a:bodyPr tags within a:txBody causes damaged presentation in PowerPoint 2007 [\#69](https://github.com/gitbrent/PptxGenJS/issues/69) ([ZouhaierSebri](https://github.com/ZouhaierSebri))
- Text bug [\#71](https://github.com/gitbrent/PptxGenJS/issues/71) ([alexbai31](https://github.com/alexbai31))
- Errors when using Webpack/Typescript [\#72](https://github.com/gitbrent/PptxGenJS/issues/72) ([Vivihung](https://github.com/Vivihung))

**Implemented Enhancements:**

- Add Slide Number formatting options [\#68](https://github.com/gitbrent/PptxGenJS/issues/68) ([ZouhaierSebri](https://github.com/ZouhaierSebri))
- Added new feature: Hyperlinks as a text option

## [v1.3.0](https://github.com/gitbrent/pptxgenjs/tree/v1.3.0) (2017-03-22)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.2.1...v1.3.0)

**Fixed Bugs:**

- Added image type to shapes to allow images to be placed on top of shapes, added more properties to ppt document [\#53](https://github.com/gitbrent/PptxGenJS/pull/53) ([ericwgreene](https://github.com/ericwgreene))
- Table-to-Slides default for un-styled tables is black text on black bkgd [\#57](https://github.com/gitbrent/PptxGenJS/issues/57) ([orpitadutta](https://github.com/orpitadutta))
- Table Header and Auto Paging [\#62](https://github.com/gitbrent/PptxGenJS/issues/62) ([tb23911](https://github.com/tb23911))

**Implemented Enhancements:**

- Removed `FileSaver.js` as a required library (only JSZip and jQuery are required now)
- Allow text multi-formatting in single table cells [\#24](https://github.com/gitbrent/PptxGenJS/issues/24) ([jenkinsns](https://github.com/jenkinsns))
- Set fixed width to column using `addSlidesForTable()` [\#42](https://github.com/gitbrent/PptxGenJS/issues/42) ([priyaraskar](https://github.com/priyaraskar))
- Enhance bullet feature: offer diff types of bullets and add numbering option [\#49](https://github.com/gitbrent/PptxGenJS/issues/49) ([gitbrent](https://github.com/gitbrent))
- Add 4 new Presentation properties: `author`, `company`, `revision`, `subject` [\#53](https://github.com/gitbrent/PptxGenJS/pull/53) ([ericwgreene](https://github.com/ericwgreene))
- Moved to semver (semantic versioning)

## [v1.2.1](https://github.com/gitbrent/pptxgenjs/tree/v1.2.1) (2017-02-26)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.2.0...v1.2.1)

**Fixed Bugs:**

- Fixed issue with using percentages with `x`,`y`,`w`,`h` in `addTable()`
- Table formatting bug with rowspans and colspans [\#46](https://github.com/gitbrent/PptxGenJS/issues/46) ([itskun](https://github.com/itskun))

**Implemented Enhancements:**

- Allow more than a single 'x' and/or 'y' table location during Table Paging [\#43](https://github.com/gitbrent/PptxGenJS/issues/43) ([jenkinsns](https://github.com/jenkinsns))
- Bullets do not work with text objects in addText() method [\#44](https://github.com/gitbrent/PptxGenJS/issues/44) ([ellisgl](https://github.com/ellisgl))
- Table location and pagination [\#47](https://github.com/gitbrent/PptxGenJS/issues/47) ([itskun](https://github.com/itskun))
- Meta: Improve auto-paging in 'addTable()' [\#48](https://github.com/gitbrent/PptxGenJS/issues/48) ([gitbrent](https://github.com/gitbrent))
- Created a new common file (`pptxgenjs-demo.js`) to hold all demo code - now used by both the browser and the node demos.

## [v1.2.0](https://github.com/gitbrent/pptxgenjs/tree/v1.2.0) (2017-02-15)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.6...v1.2.0)

**Implemented Enhancements:**

- Pagination for `slideObj.addTable()`? [\#21](https://github.com/gitbrent/PptxGenJS/issues/21) ([TheDorkSide74](https://github.com/TheDorkSide74))
- Add support for media (Audio,Video,YouTube) [\#26](https://github.com/gitbrent/PptxGenJS/issues/26) ([shashank2104](https://github.com/shashank2104))
- How to set text shadow? [\#28](https://github.com/gitbrent/PptxGenJS/issues/28) ([itskun](https://github.com/itskun))
- Allow custom Layout sizes (ex: A3) [\#29](https://github.com/gitbrent/PptxGenJS/issues/29) ([itskun](https://github.com/itskun))
- Table cell marginPt should allow zero and take TRBL array [\#32](https://github.com/gitbrent/PptxGenJS/issues/32) ([ellisgl](https://github.com/ellisgl))
- Formatting rules do not apply to string with '\n' in `addText()` [\#34](https://github.com/gitbrent/PptxGenJS/issues/34) ([itskun](https://github.com/itskun))
- Node module appends to last generated PPT on `save()` [\#38](https://github.com/gitbrent/PptxGenJS/issues/38) ([alexanderpepper](https://github.com/alexanderpepper))
- callback support for save method [\#40](https://github.com/gitbrent/PptxGenJS/issues/40) ([ellisgl](https://github.com/ellisgl))
- Callback for save method (nodejs only) [\#41](https://github.com/gitbrent/PptxGenJS/pull/41) ([ellisgl](https://github.com/ellisgl))

**Fixed Bugs:**

- Table formatting bug in `addTable()` [\#36](https://github.com/gitbrent/PptxGenJS/issues/36) ([itskun](https://github.com/itskun))

## [v1.1.6](https://github.com/gitbrent/pptxgenjs/tree/v1.1.6) (2017-01-19)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.5...v1.1.6)

**Implemented Enhancements:**

- Support for animated GIFs in `addImage()` [\#22](https://github.com/gitbrent/PptxGenJS/issues/22) ([shashank2104](https://github.com/shashank2104))
- Added new `slideNumber` option allowing `x` and `y` placement of slide number [\#25](https://github.com/gitbrent/PptxGenJS/issues/25) ([priyaraskar](https://github.com/priyaraskar))

## [v1.1.5](https://github.com/gitbrent/pptxgenjs/tree/v1.1.5) (2017-01-17)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.4...v1.1.5)

**Fixed Bugs:**

- Trouble running in NW.js [\#19](https://github.com/gitbrent/PptxGenJS/issues/19) ([GregReser](https://github.com/GregReser))
- Supported usage via node program instead of HTML [\#23](https://github.com/gitbrent/PptxGenJS/issues/23) ([parsleyt](https://github.com/parsleyt))

## [v1.1.4](https://github.com/gitbrent/pptxgenjs/tree/v1.1.4) (2017-01-04)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.3...v1.1.4)

**Fixed Bugs:**

- Table formatting options set to default on empty cells [\#20](https://github.com/gitbrent/PptxGenJS/issues/20) ([rikvdk](https://github.com/rikvdk))
- Fixed issue with `addTable()` where passing "#" before hex value for `color` or `fill` option would generate an invalid slide

## [v1.1.3](https://github.com/gitbrent/pptxgenjs/tree/v1.1.3) (2016-12-28)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.2...v1.1.3)

**Implemented Enhancements:**

- Add new options to `addSlidesForTable()` allowing for placement and size: `x`,`y`,`w`,`h` [\#18](https://github.com/gitbrent/PptxGenJS/issues/18) ([priyaraskar](https://github.com/priyaraskar))

**Fixed Bugs:**

- Cannot read property 'opts' of null [\#17](https://github.com/gitbrent/PptxGenJS/issues/17) ([ninas880025](https://github.com/ninas880025))

## [v1.1.2](https://github.com/gitbrent/pptxgenjs/tree/v1.1.2) (2016-12-16)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.1...v1.1.2)

**Implemented Enhancements:**

- The Slide `addTable()` method was modified to reduce the options passed from 2 objects to a single one

**Fixed Bugs:**

- The colW `addTable()` option is not working [\#15](https://github.com/gitbrent/PptxGenJS/issues/15) ([ninas880025](https://github.com/ninas880025))
- Modified `addSlidesForTable()`: table selectors made more specific by selecting only direct children now (nested tables would cause excessive looping) [\#14](https://github.com/gitbrent/PptxGenJS/issues/14) ([forrahul123](https://github.com/forrahul123))
- Fixed crash caused by calling `addText` without an options object

## [v1.1.1](https://github.com/gitbrent/pptxgenjs/tree/v1.1.1) (2016-12-08)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.1.0...v1.1.1)

**Implemented Enhancements:**

- Major documentation update
- Added instructions to `pptxgenjs.masters.js` file, plus more examples and code
- Added sandbox/ad-hoc code area to demo page

**Fixed Bugs:**

- Table with 7 columns generates an invalid pptx file [\#12](https://github.com/gitbrent/PptxGenJS/issues/12) ([rikvdk](https://github.com/rikvdk))

## [v1.1.0](https://github.com/gitbrent/pptxgenjs/tree/v1.1.0) (2016-11-22)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.0.1...v1.1.0)

**Implemented Enhancements:**

- Added support for base64-encoded images
- Adding npm dependencies [\#4](https://github.com/gitbrent/PptxGenJS/pull/1) ([DzmitryDulko](https://github.com/DzmitryDulko))
- Added support for italic text [\#6](https://github.com/gitbrent/PptxGenJS/issues/6) ([stevenljacobsen](https://github.com/stevenljacobsen))
- Added ability to selectively override Master Slide background color/image [\#7](https://github.com/gitbrent/PptxGenJS/issues/7) ([stevenljacobsen](https://github.com/stevenljacobsen))
- How can customize pptx theme? [\#9](https://github.com/gitbrent/PptxGenJS/issues/9) ([ielijose](https://github.com/ielijose))
- Add Rectangle to supported Master Slide shapes [\#10](https://github.com/gitbrent/PptxGenJS/pull/10) ([ielijose](https://github.com/ielijose))
- Added support for bulleted text [\#11](https://github.com/gitbrent/PptxGenJS/issues/11) ([gojko](https://github.com/gojko))

**Fixed Bugs:**

- Fix repo URL in package.json [\#5](https://github.com/gitbrent/PptxGenJS/pull/5) ([pdehaan](https://github.com/pdehaan))

## [v1.0.1](https://github.com/gitbrent/pptxgenjs/tree/v1.0.1) (2016-09-03)

[Full Changelog](https://github.com/gitbrent/pptxgenjs/compare/v1.0.0...v1.0.1)

**Implemented enhancements:**

- Moved from `cx` and `cy` option keys to `w` and `h`
- Adding ability to load data uri as images/Updating jszip library [\#2](https://github.com/gitbrent/PptxGenJS/pull/2) ([DzmitryDulko](https://github.com/DzmitryDulko))
- Publish library as npm package [\#3](https://github.com/gitbrent/PptxGenJS/issues/3) ([DzmitryDulko](https://github.com/DzmitryDulko))

**Fixed Bugs:**

- Fixed resource references [\#1](https://github.com/gitbrent/PptxGenJS/pull/1) ([DzmitryDulko](https://github.com/DzmitryDulko))

## [v1.0.0](https://github.com/gitbrent/pptxgenjs/tree/v1.0.0) (2016-03-29)

**Initial Release**
