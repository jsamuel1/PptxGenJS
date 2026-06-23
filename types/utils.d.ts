// Type definitions for @jsamuel1/pptxgenjs/utils
// Optional, format-agnostic helpers (not part of the main PptxGenJS class).

/** A resolved theme palette. All colours are 6-digit hex strings (no leading `#`). */
export interface ThemePalette {
	/** Background colour. */
	bg: string
	/** Surface (secondary background / card) colour. */
	surface: string
	/** Raised surface (mid-level background) colour. */
	surfaceRaised: string
	/** Primary accent colour. */
	accent: string
	/** Lighter accent colour. */
	accentSoft: string
	/** Primary text colour. */
	text: string
	/** Muted/secondary text colour. */
	textMuted: string
	/** Font family. */
	font: string
	/** Informational colour (sky/blue). */
	info: string
	/** Success colour (green). */
	success: string
	/** Warning colour (orange/amber). */
	warn: string
	/** Danger/error colour (red). */
	danger: string
	/** Neutral shade — lightest. */
	neutral1: string
	/** Neutral shade — mid. */
	neutral2: string
	/** Neutral shade — darkest. */
	neutral3: string
	/** Derived colour — subtle card border: `mix(accent, bg, 0.72)`. Present when `derivedColors`. */
	cardLine?: string
	/** Derived colour — card background blend: `mix(surfaceRaised, bg, 0.4)`. Present when `derivedColors`. */
	cardFill?: string
	/** Multi-role accent colours ranked by usage prominence (max 6, OOXML-aligned). accents[0] === accent. */
	accents?: string[]
	/** Derived gradient-bar stops: from `--bar-gradient` var() refs, else `[accent, accentSoft, info]`. */
	barStops?: string[]
	/** Which preset/source produced the palette (`'extracted'`, a preset name, or the fallback). */
	presetName?: string
	/** Raw parsed CSS custom properties (bare-name keyed, no leading `--`). */
	vars?: Record<string, string>
	/**
	 * Per-slot resolver provenance. Values:
	 * - `'extracted'` — slot was read directly from a CSS custom property.
	 * - `'derived'`   — slot was computed from other extracted values (cardLine, cardFill, barStops,
	 *                   anti-Frankenstein surfaceRaised).
	 * - `'preset'`    — slot came from the fallback preset (not present in the CSS).
	 */
	slotSource?: Record<string, 'extracted' | 'derived' | 'preset' | undefined>
	[key: string]: string | string[] | Record<string, string> | Record<string, 'extracted' | 'derived' | 'preset' | undefined> | undefined
}

/** Options for `extractThemeFromCSS`. */
export interface ExtractThemeOptions {
	/** Named fallback presets; merged over the built-ins (`dark`, `light`). */
	presets?: Record<string, Partial<ThemePalette>>
	/** Which preset to use as the base/fallback. @default 'dark' */
	defaultPreset?: string
	/** Bypass CSS extraction and use this preset only (still computes derived colours). Unknown name falls back to `defaultPreset` (no throw). */
	forcePreset?: string
	/** Compute derived colours (`cardLine`/`cardFill`/`barStops`). @default true */
	derivedColors?: boolean
	/** Resolve `var(--name)` references in values against the parsed vars. @default true */
	resolveVarRefs?: boolean
	/** Convert `rgb()`/`rgba()` values to 6-digit hex. @default true */
	parseRgb?: boolean
	/** CSS var name for the gradient bar used by `barStops`. @default '--bar-gradient' */
	barGradientVar?: string
	/** When no `--font*` custom property matched, scan top-level `font-family:` declarations. @default true */
	scanFontFamily?: boolean
	/** Selector priority list scanned for a `font-family:` declaration (highest priority first). */
	fontFamilySelectors?: string[]
	/** User-supplied variable-name→slot aliases applied BEFORE the built-in VAR_TO_SLOT lookup. */
	varAliases?: Record<string, string>
}

/**
 * Parse CSS `:root` custom properties into a theme palette, falling back to a preset for any
 * slot not present in the CSS.
 */
export function extractThemeFromCSS(css: string, options?: ExtractThemeOptions): ThemePalette

/** A single colour stop within a gradient fill (mirrors the core `GradientStop`). */
export interface GradientStop {
	/** Stop position as a percentage 0–100. */
	position: number
	/** Hex colour (no leading `#`). */
	color: string
	/** Optional per-stop alpha 0–100 (100 = fully transparent). */
	transparency?: number
}

/** Gradient fill properties (mirrors the core `GradientFillProps`; drops straight into `addShape({ fill })`). */
export interface GradientFillProps {
	type: 'gradient'
	/** `'horizontal'` (0°), `'vertical'` (90°), `'diagonal'` (45°), or an angle in degrees. */
	direction?: 'horizontal' | 'vertical' | 'diagonal' | number
	stops: GradientStop[]
	/** Rotate gradient with the shape. @default true */
	rotWithShape?: boolean
}

/** A single normalised, paint-resolved sub-path extracted from an SVG. */
export interface SvgPart {
	/** Normalised path — absolute `M`/`L`/`C`/`Q`/`Z` only (no `A`/`H`/`V`/`S`/`T`/relative). */
	d: string
	/** The SVG `viewBox` width/height (or the `opts.viewBox` override). */
	viewBox: { w: number; h: number }
	/** Solid hex colour (no `#`) OR a gradient fill resolved from a `url(#id)` reference. */
	fill: string | GradientFillProps
	/** Stroke colour (6-hex, no `#`) when the element is stroked. */
	stroke?: string
	/** Stroke width, in viewBox units. */
	strokeWidth?: number
	/** Resolved opacity 0–1 (from `fill-opacity`/`opacity`), when < 1. */
	opacity?: number
	/** How the element was painted in the source: `'stroke'` when fill is `none` and a stroke is present. */
	mode: 'fill' | 'stroke'
}

/** Options for `parseSvg`. */
export interface ParseSvgOptions {
	/** Override the SVG's own `viewBox` width/height. */
	viewBox?: { w: number; h: number }
	/** Fallback fill (6-hex, no `#`) when an element has no resolvable paint. @default '000000' */
	defaultFill?: string
}

/**
 * Parse an SVG string into normalised, paint-resolved `SvgPart`s. The output `d` contains only
 * absolute `M`/`L`/`C`/`Q`/`Z` commands (arcs, smooth curves, primitives, and relative commands
 * are all folded), and `url(#id)` gradient references are resolved to `GradientFillProps`.
 */
export function parseSvg(markup: string, options?: ParseSvgOptions): SvgPart[]

/**
 * A single card parsed from an HTML card-grid by `parseCards()`. The shape spreads directly into
 * `slide.addCard()` v2 (`icon`, `title`, `description`, `badge`, `accentBar`, and the `colors.*` map
 * onto `iconColor`/`iconFill`/`fill`/`border`/`titleFont.color`/`descFont.color`).
 */
export interface CardData {
	/** Card icon — an inline SVG (multi-path, via `parseSvg`), a Font-Awesome glyph, or a leading emoji. */
	icon?:
		| { type: 'svg'; parts: SvgPart[] }
		| {
			type: 'fontIcon'
			/** Resolved glyph codepoint as a string, or `''` when only the class is known. */
			char: string
			/** PowerPoint font family to render the glyph with. */
			fontFace: string
			/** Glyph token without the family prefix, e.g. `'users'` for `fa-users`. */
			glyphName?: string
			/** The icon element's full class string, e.g. `'fas fa-users'`. */
			className?: string
			/** Detected icon-font family key: `'fa' | 'bi' | 'ph' | 'ion' | 'material' | string`. */
			fontFamily?: string
		  }
		| { type: 'emoji'; text: string }
	/** Card title (always present; `''` when none could be detected). */
	title: string
	/** Card description / body text. */
	description?: string
	/** Small pill/count badge; `color` (badge FILL colour, 6-hex, no `#`) is OMITTED when undetectable. */
	badge?: { text: string; color?: string }
	/** Thin left-edge accent bar (from a `border-left` rule). `width` is in source px. */
	accentBar?: { color: string | GradientFillProps; width: number }
	/** Colours read from inline styles. All hex values are 6-digit, no `#`. */
	colors: {
		iconColor?: string
		tileFill?: string | GradientFillProps
		cardFill?: string | GradientFillProps
		borderColor?: string
		/** Border transparency (percent, 0–100) from an `rgba()`/`#rrggbbaa` border colour. Omitted when opaque. */
		borderTransparency?: number
		titleColor?: string
		descColor?: string
	}
	/** Back-reference to the internal source node (advanced callers). */
	_el?: unknown
}

/** Options for `parseCards`. */
export interface ParseCardsOptions {
	/** Class pattern (tested per class token) marking a grid CONTAINER. @default /(?:^|-)grid\b/ */
	containerPattern?: RegExp
	/** Class pattern (tested per class token) marking a CARD. @default /(?:^|-)(card|item|tile|cell)\b/ */
	cardPattern?: RegExp
	/** Class pattern; elements within a matching region are skipped (mockups/flows). */
	excludeWithin?: RegExp
	/** Fallback fill (6-hex, no `#`) handed to `parseSvg` for unpainted icon elements. */
	defaultFill?: string
	/**
	 * Optional SYNCHRONOUS resolver from an icon-element class string to vector parts. When it returns
	 * a non-empty array for a card's font-icon, `parseCards` emits `{ type: 'svg', parts }` instead of
	 * `{ type: 'fontIcon', … }`. Returning `null`/`[]` falls back to the (glyph-aware) `fontIcon`
	 * descriptor. Must be sync — `parseCards` stays synchronous.
	 */
	iconResolver?: (className: string, fontFamily: string, glyphName: string) => SvgPart[] | null
	/** Class pattern identifying TITLE elements within a card. @default /(?:^|-)(title|name|heading|head|label)$/ */
	titlePattern?: RegExp
	/** Class pattern identifying DESCRIPTION elements within a card. @default /(?:^|-)(desc|text|body|caption|subtitle|sub|detail|blurb)$/ */
	descPattern?: RegExp
	/** Class pattern identifying BADGE/eyebrow/kicker elements within a card. @default /(?:^|-)(badge|pill|tag|count|chip|kicker|eyebrow|section-label)$/i */
	badgePattern?: RegExp
	/** Class pattern for elements that must NEVER be adopted as sibling cards. @default /(^|-)(quote|callout|testimonial|blockquote)\b/ */
	neverAdoptPattern?: RegExp
	/** Max character length for title-likeness heuristic in sibling adoption. @default 60 */
	titleMaxChars?: number
	/** Max character length for badge text. @default 24 */
	badgeMaxChars?: number
}

/**
 * Parse an HTML card-grid into `CardData[]` ready to spread into `slide.addCard()`. Detection is
 * structure-driven (framework-agnostic): cards are found by class pattern or a grid/flex container,
 * then each card's icon/title/description/badge/colours are read from its structure. Colours are read
 * from INLINE styles only in this release (the deeper CSS cascade is a documented limitation).
 *
 * @param input - a raw HTML string (Node). A live DOM node is not handled in this release.
 * @returns one `CardData` per detected card (empty array when no grid of ≥2 cards is found).
 */
export function parseCards(input: string, options?: ParseCardsOptions): CardData[]

/**
 * A lightweight HTML element/text node produced by `parseHtml()`. A dependency-free, DOM-free
 * shape: `tag` is `'#text'` for text nodes and `''` for the synthetic document root.
 */
export interface HNode {
	/** Lowercase tag name; `'#text'` for text nodes; `''` for the synthetic root. */
	tag: string
	/** Attributes (keys lowercased). */
	attrs: Record<string, string>
	/** Class tokens (from the `class` attribute). */
	classes: string[]
	/** Parsed inline `style="…"` declarations (keys lowercased). */
	style: Record<string, string>
	/** Child nodes (elements and `#text`), in document order. */
	children: HNode[]
	/** Parent node, or `null` for the synthetic root. */
	parent: HNode | null
	/** Raw text (text nodes only). */
	text?: string
	/** Verbatim outer markup of an `<svg>…</svg>` subtree (svg nodes only). */
	raw?: string
}

/**
 * Parse an HTML string into a lightweight {@link HNode} tree. Tolerant — never throws on
 * malformed/unclosed HTML. `<svg>` subtrees are captured opaque on `node.raw`.
 */
export function parseHtml(html: string): HNode

/**
 * Find all descendants of `root` matching a CSS `selector`, in document order (like
 * `querySelectorAll`). Supports a BOUNDED grammar only: universal `*`, type, `.class`, `#id`,
 * `[attr]`, `[attr="v"]`, `[attr*="v"]`, `[attr^="v"]`, `[attr$="v"]`, `[attr~="v"]` (word/
 * class-membership), `[attr|="v"]` (dash-match), the pseudo-classes `:first-child`, `:last-child`,
 * `:only-child`, `:nth-child(An+B)` (incl. `even`/`odd`) and `:not(<selector>)`, compound
 * (type+class/attr, no space), descendant (space), child (`>`), adjacent sibling (`+`), general
 * sibling (`~`), and selector lists (comma). Anything outside it throws `unsupported selector: …`.
 *
 * Passing an `HNode` instead of a string is a containment/descendant test (mirrors cheerio's
 * `$(root).find(node)`): returns `[selector]` iff `selector` is a descendant of `root` (not `root`
 * itself), else `[]`. A non-string/non-HNode argument throws a `TypeError`.
 */
export function query(root: HNode, selector: string | HNode): HNode[]

/** First descendant of `root` matching a string `selector`, or `null` (like `querySelector`). */
export function queryOne(root: HNode, selector: string): HNode | null

/**
 * Nearest ancestor-or-self of `node` matching `selector`, or `null` (like `Element.closest`).
 * Passing an `HNode` is an ancestor-or-self identity test (mirrors `$(node).closest(other)`):
 * returns `selector` iff `selector === node` or `selector` is an ancestor of `node`, else `null`.
 */
export function closest(node: HNode, selector: string | HNode): HNode | null

/**
 * True when `node` matches `selector` (node is the rightmost target; see `query` for the grammar).
 * Passing an `HNode` is an identity test (`node === selector`, mirrors `$(node).is(other)`).
 */
export function matches(node: HNode, selector: string | HNode): boolean

/** True when `a` is an ancestor of (or equal to) `b`. Public containment primitive. */
export function isAncestorOrSelf(a: HNode, b: HNode | null): boolean

/** Concatenated text of an element and its descendants (`<svg>` contributes nothing). */
export function textOf(node: HNode, opts?: { keepPUA?: boolean }): string
export function innerTextOf(node: HNode, opts?: { keepPUA?: boolean }): string

/** Get an attribute value (case-insensitive name), or `undefined` when absent. */
export function attr(node: HNode, name: string): string | undefined

/** Deep-copy a node (children re-parented to the copy). The result is detached (`parent === null`). */
export function clone(node: HNode): HNode

/** Serialize a node back to HTML. Uses `raw` verbatim for captured `<svg>` subtrees. */
export function outerHtml(node: HNode): string

/**
 * Decode HTML character references (named, decimal, hex) in a string — one level only
 * (`&amp;lt;` → `&lt;`, never `<`). Unknown entities pass through unchanged.
 */
export function decodeEntities(s: string): string

/** How a resolved icon part was produced. */
export type IconSource = 'cdn' | 'bundled' | 'custom'

/** Pinned CDN versions for reproducible builds. */
export declare const CDN_VERSIONS: {
	readonly fa: string
	readonly bi: string
	readonly ion: string
}

/** A resolved `SvgPart` plus the resolution-source tag. */
export interface ResolvedSvgPart extends SvgPart {
	source?: IconSource
}

/** Options for `resolveIconFonts`. */
export interface IconResolveOptions {
	/** Allow CDN fetches for KNOWN fonts not in the bundled set. @default false */
	useCdn?: boolean
	/** Caller hook resolving a class to parts; takes precedence over every built-in method. */
	customResolver?: (className: string, fontFamily: string) => Array<Partial<ResolvedSvgPart> & { d: string; viewBox: { w: number; h: number } }> | null
	/** Directory to cache CDN-fetched glyphs (a repeat resolve is a cache hit, no network). */
	cacheDir?: string
	/** Fill handed to `parseSvg` for the resolved glyph (6-hex, no `#`). @default '000000' */
	defaultFill?: string
}

/**
 * Scan an HTML string for icon-font elements (Font Awesome, Material Icons, Bootstrap Icons,
 * Phosphor, Ionicons, or a custom font) and resolve each to normalised vector path data. The
 * returned `Map` is keyed by the icon element's class string (`family|glyph` for ligature fonts);
 * each value is a `ResolvedSvgPart[]`. Resolution order (first hit wins): `customResolver` →
 * bundled offline fallback → CDN fetch (best-effort, cached). Unresolvable icons are omitted
 * (the call never throws for one bad icon).
 */
export function resolveIconFonts(html: string, options?: IconResolveOptions): Promise<Map<string, ResolvedSvgPart[]>>

// ──────────────────────────────────────────────────────────────────────────────────────────
// HTML content extractors (docs/features/feature-html-content-extractors.md) — NEUTRAL, additive structural
// recognisers. No `Archetype`/`classifySlide` API by design: each answers "is THIS structure
// present, and what is its data?" and returns data or `null`. All take an HTML string OR an `HNode`.
// ──────────────────────────────────────────────────────────────────────────────────────────

/** A single parsed table cell, shaped to map onto `slide.addTable()` rows. */
export interface TableCell {
	/** Cell text (trimmed). */
	text: string
	/** True when the source cell was a `<th>` (→ bold/header options). */
	isHeader: boolean
	/** Cell text colour (6-digit hex, no `#`), when detectable. Omitted otherwise. */
	color?: string
}

/** A parsed HTML `<table>`: rows of cells. Maps straight onto `slide.addTable()`. */
export interface TableData {
	rows: TableCell[][]
}

/** One detected column of a multi-column structure. */
export interface ColumnData {
	text: string
}

/** A single icon+label tile within a tile row (see `parseTiles`). */
export interface TileData {
	/** Tile label (the short text beside/under the icon; trimmed). */
	label: string
	/**
	 * The tile's icon, when present. `svg` carries the verbatim `<svg>…</svg>` markup (feed to
	 * `parseSvg`); `fontIcon` carries the icon element's class string; `emoji` carries the leading
	 * pictographic cluster. Omitted when the tile has no recognisable icon.
	 */
	icon?:
		| { type: 'svg'; raw: string }
		| { type: 'fontIcon'; className: string }
		| { type: 'emoji'; text: string }
}

/** Options shared by the content extractors (mirrors `parseCards`). */
export interface ParseContentOptions {
	/** Class pattern; elements within a matching region are skipped (mockups/flows). */
	excludeWithin?: RegExp
}

/**
 * Parse the first HTML `<table>` into neutral `TableData` (rows of `{ text, isHeader, color? }`),
 * ready to map onto `slide.addTable()`. Cells of a deeper NESTED `<table>` are not double-counted.
 * A `<table>` with zero `<tr>` returns `{ rows: [] }`; only the absence of any `<table>` returns
 * `null`. Accepts a raw HTML string OR an `HNode` from `parseHtml`.
 */
export function parseTable(input: string | HNode, options?: ParseContentOptions): TableData | null

/**
 * Detect an EXPLICIT multi-column structure and return one `{ text }` per column. Signals: a
 * container with ≥2 direct-child elements each carrying a `col`/`column`/`col-*` class, or a
 * container whose `column-count`/`columns` shorthand sets a count ≥ 2. Plain prose, a single block,
 * or a `<table>` are NOT columns → `null`. Accepts a raw HTML string OR an `HNode` from `parseHtml`.
 */
export function parseColumns(input: string | HNode, options?: ParseContentOptions): ColumnData[] | null

/** One row of a timeline: a time/marker token plus the remaining row text. */
export interface TimelineRow {
	/** The time/marker token, e.g. `'7:00 AM'` or a `.time`/`.timeline-time` element's text. */
	marker: string
	/** The remaining row text (the marker stripped from the front). */
	body: string
}

/** A parsed quotation + optional attribution. */
export interface QuoteData {
	/** The quotation text, surrounding quote glyphs and the attribution substring removed. */
	text: string
	/** The `cite`/`.quote-attr` text, when present. Omitted otherwise. */
	attribution?: string
}

/**
 * A parsed pill/badge/eyebrow/kicker/section-label. `bg`/`color` (the pill's RESOLVED background and
 * text colour, 6-digit hex, no `#`) are OMITTED when undetectable — never guessed.
 */
export interface BadgeData {
	/** The pill's text (trimmed). */
	text: string
	/** Resolved background/fill colour (6-hex, no `#`), when detectable via the cascade. Omitted otherwise. */
	bg?: string
	/** Resolved text colour (6-hex, no `#`), when detectable via the cascade. Omitted otherwise. */
	color?: string
}

/** A parsed callout (bordered/`.callout` box). */
export interface CalloutData {
	/** The callout's text. */
	text: string
	/** The border/border-left/border-color colour (6-digit hex, no `#`), when detectable. Omitted otherwise. */
	accent?: string
}

/**
 * Parse a list of time-stamped rows into neutral `{ marker, body }` rows. Detection is EXPLICIT
 * (`.timeline-item`, else the first `.timeline` container's direct children) then HEURISTIC
 * (elements whose text starts with a `7:00`/`12:30 PM` time token, nested wrappers de-duped so a row
 * counts once). NEUTRAL — never decides "this is a timeline slide". `null` when no rows are found.
 * Accepts a raw HTML string OR an `HNode` from `parseHtml`.
 */
export function parseTimeline(input: string | HNode, options?: ParseContentOptions): TimelineRow[] | null

/**
 * Parse the first quotation (`blockquote`, else `.quote-text`) into `{ text, attribution? }`. The
 * attribution (`cite`/`.quote-attr`) is removed from `text` and surrounding quote glyphs stripped.
 * NEUTRAL — never decides "this slide IS a quote". `null` when no quote. Accepts a string OR `HNode`.
 */
export function parseQuote(input: string | HNode, options?: ParseContentOptions): QuoteData | null

/**
 * Parse pill/badge/eyebrow/kicker/section-label labels into `BadgeData[]` (NOT `null` — `[]` when
 * none). Recognition is GENERIC / structure-driven: a class TOKEN matching the generalised pill
 * family (`badge|pill|tag|count|chip|kicker|eyebrow|section-label`) OR a SHORT ALL-CAPS label
 * sitting immediately above a heading (eyebrow-above-a-title). Each pill carries its RESOLVED
 * `bg`/`color` from the css cascade when detectable (omitted otherwise — never guessed). Nested
 * badges are de-duped (outermost wins) and empties dropped. Accepts a string OR an `HNode`.
 */
export function parseBadges(input: string | HNode, options?: ParseContentOptions): BadgeData[]

/**
 * Parse the first callout — a BORDERED box (detectable `border`/`border-left`/`border-color`
 * colour) OR a `[class*="callout"]` element — into `{ text, accent? }`. The first non-excluded match
 * in document order wins. NEUTRAL — structural only. `null` when none. Accepts a string OR `HNode`.
 */
export function parseCallout(input: string | HNode, options?: ParseContentOptions): CalloutData | null

/**
 * Detect the first horizontal row of icon+label tiles and return one {@link TileData} per tile.
 * STRUCTURE-driven (framework-agnostic): a tile row is ≥2 uniform sibling elements, each carrying one
 * icon node (inline `<svg>`, a recognised icon-font `<i>`/`<span>`, or a leading emoji) plus a SHORT
 * label — independent of class vocabulary and resolvable CSS, so it recovers `.stack`/`.stack-row`/
 * `.reg-badge` rows AND class-token-free equivalents. NEUTRAL — returns `[]` (not `null`) when none.
 * Accepts a raw HTML string OR an `HNode` from `parseHtml`.
 */
export function parseTiles(input: string | HNode, options?: ParseContentOptions): TileData[]

/** A neutral structured image node (`<img>`/`<picture>`), ready for a converter to fetch + embed. */
export interface ImageNode {
	/** Discriminant — always `'image'`. */
	kind: 'image'
	/**
	 * The image source: a data URI or absolute URL passed through verbatim; a relative URL resolved
	 * against `options.baseUrl` when supplied, else preserved as authored. The consumer fetches/embeds
	 * this — the extractor never reads it.
	 */
	src: string
	/** Alternative text (`alt` attribute, trimmed). Empty string when absent — `alt=""` is meaningful. */
	alt: string
	/** Intrinsic width in CSS px, when expressible from the `width` attr or inline `style`. Omitted otherwise. */
	width?: number
	/** Intrinsic height in CSS px, when expressible from the `height` attr or inline `style`. Omitted otherwise. */
	height?: number
}

/** Options for {@link parseImages}. */
export interface ParseImageOptions {
	/** Class pattern; an image within a matching region is skipped (mockups/flows). Mirrors parse-content. */
	excludeWithin?: RegExp
	/**
	 * Base URL for resolving a RELATIVE `src`. When omitted, a relative `src` is preserved verbatim —
	 * never guessed. Data URIs and absolute URLs are always passed through unchanged.
	 */
	baseUrl?: string
}

/**
 * Extract every image — `<img>` and the resolved image of a `<picture>` — as a neutral
 * {@link ImageNode} (`{ kind:'image', src, alt, width?, height? }`), in document order. `src` is
 * resolved (data URI / absolute URL verbatim; relative resolved against `options.baseUrl` when given),
 * `alt` is the trimmed alt text (`''` when absent), and `width`/`height` carry the intrinsic px size
 * from the `width`/`height` attribute or an inline `style` px length. NEUTRAL & DEPENDENCY-FREE —
 * represents the HTML, never fetches/embeds. Returns `[]` (NOT `null`) when no image is present.
 * Accepts a raw HTML string OR an `HNode` from `parseHtml`.
 */
export function parseImages(input: string | HNode, options?: ParseImageOptions): ImageNode[]

/** Token classification produced by `tokenizeCode`. */
export type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'operator' | 'plain'

/** Options for {@link codeRuns}. */
export interface CodeRunsOptions {
	lang?: string
	theme?: Partial<Record<TokenKind, string>>
	lineNumbers?: boolean
	highlightLines?: number[]
	fontFace?: string
	fontSize?: number
}

/** Tokenize source code into `{ text, token }` spans for syntax colouring. */
export function tokenizeCode(source: string, lang?: string): Array<{ text: string, token: TokenKind }>

/** Convert source code into `addText`-ready runs with syntax colouring. */
export function codeRuns(source: string, opts?: CodeRunsOptions): object[]

// ──────────────────────────────────────────────────────────────────────────────────────────
// CSS context layout interpreter (docs/features/feature-css-context-layout.md) — shared CSS property
// resolution with var() support, class-rule cascade, and layout-aware helpers.
// ──────────────────────────────────────────────────────────────────────────────────────────

/** A simple single-element class rule from a `<style>` block. */
export interface ClassRule { classes: string[], decls: Record<string, string> }

/** A type selector rule (bare tag or tag+classes) from a `<style>` block. */
export interface TypeRule { tag: string, classes: string[], decls: Record<string, string> }

/** Parsed stylesheet context threaded through colour analysis. Empty ⇒ inline-only (legacy) behaviour. */
export interface CssContext { rootVars: Record<string, string>, classRules: ClassRule[], typeRules: TypeRule[] }

/** Empty context — yields byte-identical output to inline-only parsing. */
export const EMPTY_CSS: CssContext

/** Resolved CSS property for `el`: INLINE style (var-resolved) wins, else CLASS RULE, else TYPE RULE. */
export function cssProp(el: HNode, prop: string, ctx: CssContext): string | undefined

/** Merged declarations of all type rules matching `el`. */
export function typeDecls(el: HNode, ctx: CssContext): Record<string, string>

/** Explicit grid column count from `grid-template-columns`; undefined when indeterminate. */
export function gridColumnsOf(node: HNode, ctx: CssContext): number | undefined

/** Flex layout info for `node`; undefined when display is not flex. */
export function flexInfoOf(node: HNode, ctx: CssContext): { direction: 'row' | 'column', wrap: boolean, grow: number | undefined } | undefined

/** CSS `column-count` value; undefined when absent or non-numeric. */
export function columnCountOf(node: HNode, ctx: CssContext): number | undefined

/** Pixel width/height; undefined when absent or non-px. */
export function sizeOf(node: HNode, ctx: CssContext): { wPx?: number, hPx?: number } | undefined

/** Parse all `<style>…</style>` blocks of the input into `:root` vars + simple class rules + type rules. */
export function parseStyleSheets(html: string): CssContext

/** Extract the first colour in a CSS value as 6-digit hex (no `#`); undefined when none. */
export function extractHex(v: string | undefined): string | undefined

/** Background colour of `el` honouring the cascade (inline > class rule > type rule, `var()` resolved); 6-hex, no `#`. */
export function bgOfCtx(el: HNode, ctx: CssContext): string | undefined

/** Colour of a single CSS property of `el` honouring the cascade (inline > class rule > type rule); 6-hex, no `#`. */
export function colorOf(el: HNode, prop: string, ctx: CssContext): string | undefined

/** Border/line transparency (percent, 0–100) of a CSS property of `el` honouring the cascade; undefined when opaque/absent. */
export function transparencyOf(el: HNode, prop: string, ctx: CssContext): number | undefined

/**
 * File paths for each role of a resolved font family.
 *
 * `matchedBy` is the resolver provenance tag:
 * - `'name-table'` — family was found in the scanned files via the OpenType name table.
 * - `'none'`       — family was requested but no matching file was found.
 *
 * Every family passed to {@link resolveFontFiles} appears in the returned Map; check
 * `matchedBy` to distinguish resolved from missing without a separate `has()` call.
 */
export interface FontFiles {
	regular?: string
	bold?: string
	italic?: string
	boldItalic?: string
	/** Resolver provenance: how (or whether) this family was matched. */
	matchedBy: 'name-table' | 'none'
}

/** Options for {@link resolveFontFiles}. */
export interface ResolveFontFilesOptions {
	/** File extensions to scan. @default ['.ttf','.otf','.ttc','.woff','.woff2'] */
	exts?: string[]
}

/**
 * Parse the family and subfamily name from a font buffer (TTF, OTF, TTC). Reads nameID 16
 * (typographic family) ?? nameID 1; nameID 17 ?? nameID 2. Returns `null` for WOFF/WOFF2
 * (unsupported) or unrecognised/truncated buffers.
 */
export function readFontName(buf: Buffer): { family: string; subfamily: string } | null

/**
 * Scan `source` (a directory path or explicit list of font file paths) for font files matching
 * the given `families` and return a `Map` from each requested family name to its resolved role
 * paths. Matching is **case-insensitive, exact** — "Inter" never matches "Inter Tight".
 *
 * Every requested family appears in the returned Map. Found families carry
 * `{ matchedBy: 'name-table', ...rolePaths }`; missing families carry `{ matchedBy: 'none' }`.
 *
 * A file whose subfamily is not one of Regular / Bold / Italic / Bold Italic is used as a
 * `regular` fallback when no regular has been found for that family yet — this covers
 * single-variant icon fonts (e.g. Font Awesome Solid) that carry a non-standard subfamily name.
 */
export function resolveFontFiles(
	source: string | string[],
	families: string[],
	opts?: ResolveFontFilesOptions,
): Map<string, FontFiles>

/** Options for {@link measureTextWidth}. */
export interface MeasureTextWidthOptions {
	/** Font size in points (required). */
	fontSize: number
	/** Path to a TTF, OTF, or TTC font file. When supplied, uses per-glyph advance widths from hmtx. */
	fontFile?: string
	/**
	 * Override the per-character em factor used by the Unicode-block fallback. When omitted, each
	 * codepoint is classified individually (CJK ≈ 1.0, Latin ≈ 0.5). When supplied, every
	 * codepoint uses this factor.
	 */
	fallbackEmFactor?: number
}

/**
 * Estimate the advance width of `text` rendered at `opts.fontSize` points, in **inches**.
 *
 * When `opts.fontFile` is given, parses the sfnt `head`/`hhea`/`hmtx`/`cmap` (format 4) tables
 * for per-glyph metrics (TTF, OTF, TTC). Falls back to Unicode-block em factors
 * (CJK/fullwidth ≈ 1.0 em, Latin/ASCII ≈ 0.5 em) when the file cannot be read, is a
 * WOFF/WOFF2, or has no format-4 cmap subtable.
 *
 * Returns `0` for an empty string.
 */
export function measureTextWidth(text: string, opts: MeasureTextWidthOptions): number

/** Relative luminance per WCAG 2.1 */
export function relativeLuminance(hex: string): number

/** Contrast ratio between two hex colors */
export function contrastRatio(hex1: string, hex2: string): number

/** Look up a CSS named colour → 6-digit uppercase hex (no `#`), or `null` if unknown. */
export declare function cssNamedColorToHex(name: string): string | null;

export declare function normalizeColor(raw: string): string;

/** Returns 'FFFFFF' or '1F2937' for best contrast against fill */
export function inkForFill(fillHex: string): string
