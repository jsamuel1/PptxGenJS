// Type definitions for @jsamuel1/pptxgenjs/utils
// Optional, format-agnostic helpers (not part of the main PptxGenJS class).

/** A resolved theme palette. All colours are 6-digit hex strings (no leading `#`). */
export interface ThemePalette {
	/** Background colour. */
	bg: string
	/** Card/surface (secondary background) colour. */
	bgSecondary: string
	/** Primary accent colour. */
	accent: string
	/** Lighter accent colour. */
	accentSoft: string
	/** Primary text colour. */
	text: string
	/** Muted/secondary text colour. */
	textSecondary: string
	/** Font family. */
	font: string
	/** Extended palette — informational/utility colours. */
	sky: string
	green: string
	orange: string
	red: string
	/** Extended palette (converter-equivalence) — extracted, with preset defaults. */
	bgMid: string
	bgLight: string
	bgDeep: string
	coral: string
	gray100: string
	gray300: string
	gray500: string
	/** Derived colour — subtle card border: `mix(accent, bg, 0.72)`. Present when `derivedColors`. */
	cardLine?: string
	/** Derived colour — card background blend: `mix(bgMid, bg, 0.4)`. Present when `derivedColors`. */
	cardFill?: string
	/** Derived gradient-bar stops: from `--bar-gradient` var() refs, else `[accent, accentSoft, sky]`. */
	barStops?: string[]
	/** Which preset/source produced the palette (`'extracted'`, a preset name, or the fallback). */
	presetName?: string
	/** Raw parsed CSS custom properties (bare-name keyed, no leading `--`). */
	vars?: Record<string, string>
	[key: string]: string | string[] | Record<string, string> | undefined
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
		| { type: 'fontIcon'; char: string; fontFace: string }
		| { type: 'emoji'; text: string }
	/** Card title (always present; `''` when none could be detected). */
	title: string
	/** Card description / body text. */
	description?: string
	/** Small pill/count badge; `color` is the badge FILL colour (6-hex, no `#`). */
	badge?: { text: string; color: string }
	/** Thin left-edge accent bar (from a `border-left` rule). `width` is in source px. */
	accentBar?: { color: string | GradientFillProps; width: number }
	/** Colours read from inline styles. All hex values are 6-digit, no `#`. */
	colors: {
		iconColor?: string
		tileFill?: string | GradientFillProps
		cardFill?: string | GradientFillProps
		borderColor?: string
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

/** How a resolved icon part was produced. */
export type IconSource = 'css-content' | 'font-file' | 'cdn' | 'bundled' | 'custom'

/** A resolved `SvgPart` plus the resolution-source tag. */
export interface ResolvedSvgPart extends SvgPart {
	source?: IconSource
}

/** Options for `resolveIconFonts`. */
export interface IconResolveOptions {
	/** CSS text for `::before`/`::after` content-property codepoint extraction. */
	stylesheets?: string[]
	/** Local woff2/woff/ttf paths for glyph outlines, keyed by font family. */
	fontFiles?: Record<string, string>
	/** Allow CDN fetches for KNOWN fonts not in the bundled set. @default true */
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
