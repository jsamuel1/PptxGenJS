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
	[key: string]: string
}

/** Options for `extractThemeFromCSS`. */
export interface ExtractThemeOptions {
	/** Named fallback presets; merged over the built-ins (`dark`, `light`). */
	presets?: Record<string, Partial<ThemePalette>>
	/** Which preset to use as the base/fallback. @default 'dark' */
	defaultPreset?: string
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
