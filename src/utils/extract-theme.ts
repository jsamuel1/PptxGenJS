/**
 * PptxGenJS — Theme Extraction utility (docs/feature-theme-extraction.md)
 *
 * Parses CSS `:root { --var: value; }` custom properties and maps known variable-name
 * patterns to a theme palette (background/accent/text/font + an extended colour set).
 * Pure, dependency-free, regex-based parsing — no DOM and no browser required, so it runs
 * in Node.js. This is an OPTIONAL utility (imported from `@jsamuel1/pptxgenjs/utils`), not
 * part of the main `PptxGenJS` class, keeping the core library focused on OOXML generation.
 *
 * v2 (converter-equivalence, docs/feature-enhancements-converter-gaps.md §3): adds
 * `rgb()`/`rgba()` parsing, `var()` resolution, derived colours (`cardLine`/`cardFill`/
 * `barStops`), an extended palette (`bgMid`/`bgLight`/`bgDeep`/`coral`/`gray100/300/500`),
 * a `forcePreset` override, and `presetName`/`vars` metadata. All additions are ADDITIVE and
 * default-on; the core slot mapping is unchanged.
 */

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
	/** Allow extra slots from custom presets. */
	[key: string]: string | string[] | Record<string, string> | undefined
}

/** Options for {@link extractThemeFromCSS}. */
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

/** Built-in dark preset (matches docs/feature-theme-extraction.md). */
const DARK_PRESET: ThemePalette = {
	bg: '121218',
	bgSecondary: '1A1A24',
	accent: '7C3AED',
	accentSoft: 'A78BFA',
	text: 'E4E4ED',
	textSecondary: '8A8A9A',
	font: 'Inter',
	sky: '38BDF8',
	green: '10B981',
	orange: 'FF9900',
	red: 'EF4444',
	// Extended (converter-equivalence)
	bgMid: '1E1E2A',
	bgLight: '2A2A38',
	bgDeep: '0C0C12',
	coral: 'FB7185',
	gray100: 'E4E4ED',
	gray300: 'A0A0B0',
	gray500: '64646E',
}

/** Built-in light preset. */
const LIGHT_PRESET: ThemePalette = {
	bg: 'FFFFFF',
	bgSecondary: 'F4F4F7',
	accent: '7C3AED',
	accentSoft: 'A78BFA',
	text: '121218',
	textSecondary: '5A5A6A',
	font: 'Inter',
	sky: '0EA5E9',
	green: '059669',
	orange: 'EA580C',
	red: 'DC2626',
	// Extended (converter-equivalence)
	bgMid: 'F0F0F4',
	bgLight: 'FAFAFC',
	bgDeep: 'E8E8EE',
	coral: 'F43F5E',
	gray100: '2A2A32',
	gray300: '5A5A6A',
	gray500: '8A8A9A',
}

/**
 * Exact CSS-variable-name → theme-slot map. Names are matched exactly (NOT by substring) so
 * `--bg` and `--bg-card` resolve to different slots. Mirrors the table in the feature spec.
 */
const VAR_TO_SLOT: Record<string, keyof ThemePalette> = {
	// bg
	bg: 'bg', 'color-bg': 'bg', background: 'bg',
	'bg-color': 'bg', 'background-color': 'bg', surface: 'bg', 'page-bg': 'bg', canvas: 'bg',
	// bgSecondary
	'bg-card': 'bgSecondary', card: 'bgSecondary', 'color-bg-secondary': 'bgSecondary', 'bg-surface': 'bgSecondary',
	'surface-2': 'bgSecondary', 'surface-variant': 'bgSecondary', panel: 'bgSecondary', elevated: 'bgSecondary',
	// accent
	purple: 'accent', accent: 'accent', 'color-primary': 'accent', primary: 'accent',
	brand: 'accent', 'brand-color': 'accent', 'primary-color': 'accent', 'accent-color': 'accent', 'theme-color': 'accent', highlight: 'accent',
	// accentSoft
	'purple-soft': 'accentSoft', 'accent-soft': 'accentSoft', 'color-primary-light': 'accentSoft',
	'accent-light': 'accentSoft', 'primary-light': 'accentSoft', 'brand-light': 'accentSoft',
	// text
	white: 'text', text: 'text', 'color-text': 'text', foreground: 'text',
	'text-color': 'text', fg: 'text', ink: 'text', 'body-color': 'text', 'on-background': 'text',
	// textSecondary
	gray: 'textSecondary', muted: 'textSecondary', 'color-text-secondary': 'textSecondary',
	'text-muted': 'textSecondary', 'text-secondary': 'textSecondary', subtle: 'textSecondary', grey: 'textSecondary', dim: 'textSecondary',
	// sky
	sky: 'sky', blue: 'sky', info: 'sky',
	cyan: 'sky', teal: 'sky', azure: 'sky',
	// green
	green: 'green', success: 'green',
	emerald: 'green', lime: 'green', mint: 'green',
	// orange
	orange: 'orange', warning: 'orange',
	amber: 'orange', yellow: 'orange', gold: 'orange',
	// red
	red: 'red', error: 'red', danger: 'red',
	pink: 'red', rose: 'red', crimson: 'red',
	// font
	font: 'font', 'font-family': 'font',
	// extended (converter-equivalence)
	'bg-mid': 'bgMid',
	'bg-light': 'bgLight', 'bg-hover': 'bgLight',
	'bg-deep': 'bgDeep',
	coral: 'coral', 'secondary-accent': 'coral',
	'gray-100': 'gray100', 'gray-300': 'gray300', 'gray-500': 'gray500',
}

/** Slots whose value is a colour (vs. a font family) — used to decide value normalisation. */
const COLOR_SLOTS = new Set<keyof ThemePalette>([
	'bg', 'bgSecondary', 'accent', 'accentSoft', 'text', 'textSecondary', 'sky', 'green', 'orange', 'red',
	'bgMid', 'bgLight', 'bgDeep', 'coral', 'gray100', 'gray300', 'gray500',
])

/** Parse an `rgb()`/`rgba()` value to a 6-digit hex (upper-case, no `#`). Returns null on non-match. */
function rgbToHex (value: string): string | null {
	const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
	if (!m) return null
	return [m[1], m[2], m[3]]
		.map(n => Math.min(255, Math.max(0, parseInt(n, 10))).toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase()
}

/** Resolve `var(--name)` references against the parsed vars map (bare-name keyed). Recursive with a depth cap (clamp-don't-crash on cyclic refs). */
function resolveVar (value: string, vars: Record<string, string>, depth = 0): string {
	if (typeof value !== 'string' || depth > 16 || value.indexOf('var(') === -1) return value
	const replaced = value.replace(/var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)/g, (_match, name: string) => {
		const v = vars[String(name).trim().toLowerCase()]
		return v !== undefined && v !== null ? v : ''
	})
	if (replaced === value) return replaced
	return resolveVar(replaced, vars, depth + 1)
}

/** Normalise a colour value to a 6-digit hex (no `#`). 3-digit hex expanded; `rgb()/rgba()` parsed when enabled; otherwise returned trimmed. */
function normalizeColor (raw: string, parseRgb = true): string {
	let v = raw.trim().replace(/^#/, '')
	// Expand 3-digit shorthand (#abc -> AABBCC)
	if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split('').map(c => c + c).join('')
	// Uppercase 6/8-digit hex for consistency with the rest of the library
	if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(v)) return v.toUpperCase()
	// rgb()/rgba() → hex (converter-equivalence)
	if (parseRgb) {
		const hex = rgbToHex(raw)
		if (hex) return hex
	}
	// hsl()/named colours are returned trimmed but unconverted (documented limitation)
	return v
}

/** Mix two hex colours per channel: `round(a*(1-weight) + b*weight)` (weight is the SECOND colour's weight). Mirrors the converter's `mix`. */
function mixColors (a: string, b: string, weight: number): string {
	const norm = (h: string): number[] | null => {
		const x = normalizeColor(h)
		return /^[0-9A-F]{6}$/.test(x) ? (x.match(/.{2}/g) as string[]).map(p => parseInt(p, 16)) : null
	}
	const pa = norm(a)
	const pb = norm(b)
	if (!pa || !pb) {
		const fallback = pa ? a : pb ? b : '000000'
		return normalizeColor(fallback)
	}
	return pa
		.map((v, i) => Math.round(v * (1 - weight) + pb[i] * weight).toString(16).padStart(2, '0'))
		.join('')
		.toUpperCase()
}

/** Derive gradient-bar stops from the `--bar-gradient` var (≥2 `var()` refs → resolved colours), else `[accent, accentSoft, sky]`. */
function deriveBarStops (vars: Record<string, string>, palette: ThemePalette, barVarName: string, resolveVarRefs: boolean, parseRgb: boolean): string[] {
	const barKey = String(barVarName || '--bar-gradient').replace(/^--/, '').toLowerCase()
	const barVal = vars[barKey] || ''
	const refs = [...barVal.matchAll(/var\(\s*--([\w-]+)\s*\)/g)].map(m => m[1])
	if (refs.length >= 2) {
		const stops = refs
			.map(name => {
				let val = vars[String(name).trim().toLowerCase()] || ''
				if (resolveVarRefs) val = resolveVar(val, vars)
				return val ? normalizeColor(val, parseRgb) : ''
			})
			.filter(Boolean)
		if (stops.length >= 2) return stops
	}
	return [palette.accent, palette.accentSoft, palette.sky]
}

/** Normalise a font-family value: strip surrounding quotes and take the first family. */
function normalizeFont (raw: string): string {
	const first = raw.split(',')[0].trim()
	return first.replace(/^['"]/, '').replace(/['"]$/, '').trim()
}

/**
 * Canonicalise a bare CSS variable name into ordered lookup candidates for {@link VAR_TO_SLOT}.
 * Lowercases, folds en-GB spelling (`colour`→`color`, `grey`→`gray`), and strips a trailing
 * `-color`/`-colour` suffix. Returns `[exact]` or `[exact, stripped]` — the caller tries the
 * exact form first, then the suffix-stripped form. Matching stays EXACT against the allowlist;
 * this only adds deterministic spelling/suffix folding, never fuzzy/substring matching.
 */
function canonicalVarName (name: string): string[] {
	const lc = name.toLowerCase().replace(/colour/g, 'color').replace(/\bgrey\b/g, 'gray')
	const stripped = lc.replace(/-colou?r$/, '')
	return lc === stripped ? [lc] : [lc, stripped]
}

/**
 * Extract `--name: value;` custom-property declarations from CSS text.
 * Prefers declarations inside `:root { … }` blocks; if none are found, falls back to scanning
 * the entire string (covers inline/style-block custom props without a `:root` selector).
 * @returns map of bare variable name (no leading `--`) -> value
 */
function parseCssVars (css: string): Record<string, string> {
	const out: Record<string, string> = {}
	const declRegex = /--([\w-]+)\s*:\s*([^;]+);/g

	const collect = (text: string): void => {
		let m: RegExpExecArray | null
		while ((m = declRegex.exec(text)) !== null) {
			out[m[1].trim().toLowerCase()] = m[2].trim()
		}
	}

	// 1) :root blocks (there can be more than one)
	const rootRegex = /:root\s*\{([^}]*)\}/g
	let rootMatch: RegExpExecArray | null
	let foundRoot = false
	while ((rootMatch = rootRegex.exec(css)) !== null) {
		foundRoot = true
		declRegex.lastIndex = 0
		collect(rootMatch[1])
	}

	// 2) Fallback: no :root vars — scan the whole CSS for custom-prop declarations
	if (!foundRoot) {
		declRegex.lastIndex = 0
		collect(css)
	}

	return out
}

/**
 * Parse CSS `:root` custom properties into a theme palette, falling back to a preset for any
 * slot not present in the CSS. v2 additionally resolves `var()` references, parses `rgb()/rgba()`,
 * computes derived colours (`cardLine`/`cardFill`/`barStops`), and attaches `presetName`/`vars`.
 * @param {string} css - CSS text (or any text containing `--name: value;` declarations)
 * @param {ExtractThemeOptions} [options] - presets, fallback, and the v2 converter-equivalence flags
 * @returns {ThemePalette} the resolved palette (always complete — preset fills the gaps)
 * @example
 * const theme = extractThemeFromCSS(':root{ --bg:#121218; --purple:#7C3AED; }')
 * // => { bg: '121218', accent: '7C3AED', cardLine: '301D54', barStops: [...], presetName: 'extracted', ... }
 */
export function extractThemeFromCSS (css: string, options: ExtractThemeOptions = {}): ThemePalette {
	const presets: Record<string, Partial<ThemePalette>> = { dark: DARK_PRESET, light: LIGHT_PRESET, ...(options.presets || {}) }
	const fallbackName = options.defaultPreset && presets[options.defaultPreset] ? options.defaultPreset : 'dark'
	const derivedColors = options.derivedColors !== false
	const resolveVarRefs = options.resolveVarRefs !== false
	const parseRgb = options.parseRgb !== false
	const barGradientVar = options.barGradientVar || '--bar-gradient'

	const vars: Record<string, string> = (typeof css === 'string' && css.length > 0) ? parseCssVars(css) : {}

	let theme: ThemePalette
	let presetName: string

	const forced = options.forcePreset
	if (forced && presets[forced]) {
		// forcePreset: bypass CSS extraction, use the named preset only
		theme = { ...DARK_PRESET, ...presets[forced] } as ThemePalette
		presetName = forced
	} else {
		// Start from a complete palette (dark) then layer the chosen fallback preset so the result is always whole
		const base = presets[fallbackName] || DARK_PRESET
		theme = { ...DARK_PRESET, ...base } as ThemePalette
		let matched = 0
		Object.keys(vars).forEach(name => {
			let slot: keyof ThemePalette | undefined
			for (const cand of canonicalVarName(name)) {
				if (VAR_TO_SLOT[cand]) { slot = VAR_TO_SLOT[cand]; break }
			}
			if (!slot) return
			matched++
			let value = vars[name]
			if (resolveVarRefs) value = resolveVar(value, vars)
			theme[slot] = slot === 'font' || !COLOR_SLOTS.has(slot) ? normalizeFont(value) : normalizeColor(value, parseRgb)
		})
		presetName = matched > 0 ? 'extracted' : fallbackName
	}

	if (derivedColors) {
		theme.cardLine = mixColors(theme.accent, theme.bg, 0.72)
		theme.cardFill = mixColors(theme.bgMid, theme.bg, 0.4)
		theme.barStops = deriveBarStops(vars, theme, barGradientVar, resolveVarRefs, parseRgb)
	}

	theme.presetName = presetName
	theme.vars = vars

	return theme
}

export default extractThemeFromCSS
