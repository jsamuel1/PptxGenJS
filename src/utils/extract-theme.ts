/**
 * PptxGenJS — Theme Extraction utility (docs/features/feature-theme-extraction.md)
 *
 * Parses CSS `:root { --var: value; }` custom properties and maps known variable-name
 * patterns to a theme palette (background/accent/text/font + an extended colour set).
 * Pure, dependency-free, regex-based parsing — no DOM and no browser required, so it runs
 * in Node.js. This is an OPTIONAL utility (imported from `@jsamuel1/pptxgenjs/utils`), not
 * part of the main `PptxGenJS` class, keeping the core library focused on OOXML generation.
 *
 * v2 (converter-equivalence, docs/features/feature-enhancements-converter-gaps.md §3): adds
 * `rgb()`/`rgba()` parsing, `var()` resolution, derived colours (`cardLine`/`cardFill`/
 * `barStops`), role-named palette slots (`surface`/`surfaceRaised`/`info`/`success`/`warn`/
 * `danger`/`neutral1`/`neutral2`/`neutral3`), a `forcePreset` override, and `presetName`/
 * `vars` metadata. All additions are ADDITIVE and default-on; the core slot mapping is unchanged.
 */

import { relativeLuminance } from '../gen-utils'
import { normalizeColor } from './color-convert'

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
	/** Allow extra slots from custom presets. */
	[key: string]: string | string[] | Record<string, string> | Record<string, 'extracted' | 'derived' | 'preset' | undefined> | undefined
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
	/**
	 * When no `--font*` custom property matched, scan top-level `font-family:` declarations
	 * (priority selectors first) and adopt the first concrete, non-generic family. @default true
	 */
	scanFontFamily?: boolean
	/**
	 * Selector priority list scanned for a `font-family:` declaration (highest priority first).
	 * @default [':root','html','body','.slide','section.slide','.reveal','*']
	 */
	fontFamilySelectors?: string[]
	/**
	 * User-supplied variable-name→slot aliases applied BEFORE the built-in VAR_TO_SLOT lookup.
	 * Keys are bare variable names (no `--`); values are ThemePalette slot names.
	 */
	varAliases?: Record<string, string>
}

/** Built-in dark preset (neutral, unbranded defaults). */
const DARK_PRESET: ThemePalette = {
	bg: '1a1a2e',
	surface: '25253e',
	surfaceRaised: '2d2d4a',
	accent: '6366f1',
	accentSoft: '818cf8',
	text: 'e8e8f0',
	textMuted: '9090a8',
	font: '',
	info: '38bdf8',
	success: '34d399',
	warn: 'fbbf24',
	danger: 'f87171',
	neutral1: 'e8e8f0',
	neutral2: 'a0a0b8',
	neutral3: '606078',
	accents: ['6366f1', '818cf8', '38bdf8', '34d399', 'fbbf24', 'f87171'],
}

/** Built-in light preset (neutral, unbranded defaults). */
const LIGHT_PRESET: ThemePalette = {
	bg: 'ffffff',
	surface: 'f5f5f7',
	surfaceRaised: 'ebebf0',
	accent: '6366f1',
	accentSoft: '818cf8',
	text: '1a1a2e',
	textMuted: '5a5a72',
	font: '',
	info: '0ea5e9',
	success: '059669',
	warn: 'd97706',
	danger: 'dc2626',
	neutral1: '2a2a3a',
	neutral2: '5a5a72',
	neutral3: '8a8aa2',
	accents: ['6366f1', '818cf8', '0ea5e9', '059669', 'd97706', 'dc2626'],
}

/**
 * Exact CSS-variable-name → theme-slot map. Names are matched exactly (NOT by substring) so
 * `--bg` and `--bg-card` resolve to different slots. Mirrors the table in the feature spec.
 */
const VAR_TO_SLOT: Record<string, keyof ThemePalette> = {
	// bg
	bg: 'bg', 'color-bg': 'bg', background: 'bg',
	'bg-color': 'bg', 'background-color': 'bg', surface: 'bg', 'page-bg': 'bg', canvas: 'bg',
	// surface
	'bg-card': 'surface', card: 'surface', 'color-bg-secondary': 'surface', 'bg-surface': 'surface',
	'surface-2': 'surface', 'surface-variant': 'surface', panel: 'surface', elevated: 'surface',
	// accent
	accent: 'accent', 'color-primary': 'accent', primary: 'accent',
	brand: 'accent', 'brand-color': 'accent', 'primary-color': 'accent', 'accent-color': 'accent', 'theme-color': 'accent', highlight: 'accent',
	// accentSoft
	'purple-soft': 'accentSoft', 'accent-soft': 'accentSoft', 'color-primary-light': 'accentSoft',
	'accent-light': 'accentSoft', 'primary-light': 'accentSoft', 'brand-light': 'accentSoft', secondary: 'accentSoft',
	// text
	text: 'text', 'color-text': 'text', foreground: 'text',
	'text-color': 'text', fg: 'text', ink: 'text', 'body-color': 'text', 'on-background': 'text',
	'body-bg': 'bg', 'on-surface': 'text', 'on-primary': 'text',
	// textMuted
	gray: 'textMuted', muted: 'textMuted', 'color-text-secondary': 'textMuted',
	'text-muted': 'textMuted', 'text-secondary': 'textMuted', subtle: 'textMuted', grey: 'textMuted', dim: 'textMuted',
	// info
	sky: 'info', blue: 'info', info: 'info',
	cyan: 'info', teal: 'info', azure: 'info',
	// success
	green: 'success', success: 'success',
	emerald: 'success', lime: 'success', mint: 'success',
	// warn
	orange: 'warn', warning: 'warn',
	amber: 'warn', yellow: 'warn', gold: 'warn',
	// danger
	red: 'danger', error: 'danger', danger: 'danger',
	pink: 'danger', rose: 'danger', crimson: 'danger',
	// font
	font: 'font', 'font-family': 'font',
	'font-sans': 'font', 'font-body': 'font', 'font-base': 'font', typeface: 'font',
	// surfaceRaised
	'bg-mid': 'surfaceRaised',
	// neutrals
	'gray-100': 'neutral1', 'gray-300': 'neutral2', 'gray-500': 'neutral3',
}

/** Slots whose value is a colour (vs. a font family) — used to decide value normalisation. */
const COLOR_SLOTS = new Set<keyof ThemePalette>([
	'bg', 'surface', 'surfaceRaised', 'accent', 'accentSoft', 'text', 'textMuted', 'info', 'success', 'warn', 'danger',
	'neutral1', 'neutral2', 'neutral3',
])

/** HSL saturation (0-1) of a 6-hex colour. Returns 0 for greys / invalid input. */
function hexSaturation (hex: string): number {
	if (!/^[0-9A-F]{6}$/i.test(hex)) return 0
	const [r, g, b] = (hex.match(/.{2}/g) as string[]).map(p => parseInt(p, 16) / 255)
	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	if (max === min) return 0
	const l = (max + min) / 2
	const d = max - min
	return l > 0.5 ? d / (2 - max - min) : d / (max + min)
}

/**
 * Tally how PROMINENTLY each candidate colour is APPLIED across the parsed CSS.
 *
 * SAU-62/SAU-37: name-matching alone cannot distinguish a deck that leads with `--orange`
 * from one that leads with `--purple` when both literally declare `--purple`. Only usage
 * tells them apart. We scan every CSS declaration and award a weight per occurrence:
 *  - role-bearing text properties (`color`, `fill`, `text-…color`) and the var that backs them
 *    weigh more than incidental ones (`border-color`, `background`, gradients).
 *
 * Both literal colour values (`color:#FF9900`) and `var(--name)` references are counted; a
 * `var(--name)` reference credits the colour that `--name` resolves to. Returns a map of
 * 6-hex (uppercase) → accumulated weight. Pure regex scan — no DOM.
 */
function tallyColorProminence (css: string, vars: Record<string, string>, resolveVarRefs: boolean): Map<string, number> {
	const scores = new Map<string, number>()
	if (typeof css !== 'string' || css.length === 0) return scores
	const add = (hexRaw: string, weight: number): void => {
		const hex = (hexRaw || '').toUpperCase()
		if (!/^[0-9A-F]{6}$/.test(hex)) return
		scores.set(hex, (scores.get(hex) || 0) + weight)
	}
	// Resolve a var name (bare, lower-cased) to a 6-hex value, if it maps to a colour.
	const varToHex = (name: string): string => {
		let val = vars[name]
		if (val === undefined) return ''
		if (resolveVarRefs) val = resolveVar(val, vars)
		return normalizeColor(val).slice(0, 6)
	}
	// Walk each `property: value;` declaration. We deliberately ignore custom-prop declarations
	// (`--x:`) — those define the palette; we want where colours are CONSUMED.
	const declRe = /(^|[;{])\s*(-?[a-z][\w-]*)\s*:\s*([^;{}]+)/gi
	let m: RegExpExecArray | null
	while ((m = declRe.exec(css)) !== null) {
		const prop = m[2].toLowerCase()
		if (prop.startsWith('--')) continue
		const val = m[3]
		// Role weight: text/heading/label-ish colour application weighs most.
		let weight = 1
		if (prop === 'color' || prop === 'fill' || prop === 'stroke' || /(^|-)text-.*color$/.test(prop) || prop === '-webkit-text-fill-color') weight = 4
		else if (prop === 'border-color' || /(^|-)border(-\w+)?-color$/.test(prop) || prop === 'outline-color' || prop === 'text-decoration-color' || prop === 'caret-color') weight = 2
		else if (prop === 'background' || prop === 'background-color' || prop === 'background-image' || /gradient/.test(val)) weight = 1
		// (a) var(--name) references inside the value
		const varRe = /var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)/g
		let vm: RegExpExecArray | null
		while ((vm = varRe.exec(val)) !== null) {
			add(varToHex(vm[1].trim().toLowerCase()), weight)
		}
		// (b) literal colour tokens inside the value (hex / rgb / hsl / named etc.)
		const litRe = /#[0-9a-fA-F]{3,8}\b|(?:rgin?|rgba|rgb|hsla|hsl|hwb|oklch|lab)\([^)]*\)/g
		let lm: RegExpExecArray | null
		while ((lm = litRe.exec(val)) !== null) {
			add(normalizeColor(lm[0]).slice(0, 6), weight)
		}
	}
	return scores
}

/** Resolve `var(--name)` references against the parsed vars map (bare-name keyed). Recursive with a depth cap (clamp-don't-crash on cyclic refs). */
function resolveVar (value: string, vars: Record<string, string>, depth = 0): string {
	if (typeof value !== 'string' || depth > 16 || value.indexOf('var(') === -1) return value
	const replaced = value.replace(/var\(\s*--([\w-]+)\s*(?:,([^)]*))?\)/g, (_match, name: string, fallback?: string) => {
		const v = vars[String(name).trim().toLowerCase()]
		if (v !== undefined && v !== null) return v
		// SAU-46: honour the var() fallback (e.g. `var(--undefined, #FF9900)` → `#FF9900`)
		// when the referenced var is not declared, instead of collapsing to ''.
		return fallback !== undefined ? fallback.trim() : ''
	})
	if (replaced === value) return replaced
	return resolveVar(replaced, vars, depth + 1)
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
function deriveBarStops (vars: Record<string, string>, palette: ThemePalette, barVarName: string, resolveVarRefs: boolean, _parseRgb: boolean): string[] {
	const barKey = String(barVarName || '--bar-gradient').replace(/^--/, '').toLowerCase()
	const barVal = vars[barKey] || ''
	const refs = [...barVal.matchAll(/var\(\s*--([\w-]+)\s*\)/g)].map(m => m[1])
	if (refs.length >= 2) {
		const stops = refs
			.map(name => {
				let val = vars[String(name).trim().toLowerCase()] || ''
				if (resolveVarRefs) val = resolveVar(val, vars)
				return val ? normalizeColor(val).slice(0, 6) : ''
			})
			.filter(Boolean)
		if (stops.length >= 2) return stops
	}
	return [palette.accent, palette.accentSoft, palette.info]
}

/** Normalise a font-family value: strip surrounding quotes and take the first family. */
function normalizeFont (raw: string): string {
	const first = raw.split(',')[0].trim()
	return first.replace(/^['"]/, '').replace(/['"]$/, '').trim()
}

/** CSS generic font families (and CSS-wide keywords) skipped when scanning `font-family:`. */
const GENERIC_FONTS = new Set([
	'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
	'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
	'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
])

/** Default selector priority list scanned for a top-level `font-family:` declaration. */
const DEFAULT_FONT_SELECTORS = [':root', 'html', 'body', '.slide', 'section.slide', '.reveal', '*']

/**
 * Scan top-level CSS rules for a `font-family:` declaration and return the first CONCRETE
 * (non-generic) family, preferring selectors in the given priority order, then falling back to
 * declaration order. Regex-based and DOM-free — the full computed cascade is out of scope.
 * Returns `''` when no rule declares a concrete family.
 */
function scanFontFamilyDeclarations (css: string, selectors: string[]): string {
	if (typeof css !== 'string' || css.length === 0) return ''
	// Map each top-level selector (lower-cased) to its first `font-family:` value.
	const found: Record<string, string> = {}
	const order: string[] = []
	const ruleRegex = /([^{}]+)\{([^{}]*)\}/g
	let m: RegExpExecArray | null
	while ((m = ruleRegex.exec(css)) !== null) {
		// Match `font-family:` but NOT a custom prop like `--font-family:` (boundary guard).
		const fm = m[2].match(/(?:^|[^-\w])font-family\s*:\s*([^;}]+)/i)
		if (!fm) continue
		const sel = m[1].trim().toLowerCase()
		if (found[sel] === undefined) { found[sel] = fm[1].trim(); order.push(sel) }
	}
	const concrete = (value: string): string => {
		for (const part of value.split(',')) {
			const fam = normalizeFont(part)
			if (fam && !GENERIC_FONTS.has(fam.toLowerCase())) return fam
		}
		return ''
	}
	// 1) priority selectors, in order
	for (const sel of selectors) {
		const key = String(sel).trim().toLowerCase()
		if (found[key] !== undefined) {
			const fam = concrete(found[key])
			if (fam) return fam
		}
	}
	// 2) fallback: any declaring rule, in declaration order
	for (const sel of order) {
		const fam = concrete(found[sel])
		if (fam) return fam
	}
	return ''
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

/** Known CSS framework prefixes to strip before VAR_TO_SLOT lookup. */
const KNOWN_PREFIXES = ['bs-', 'md-sys-color-', 'mui-', 'tw-', 'chakra-', 'mantine-', 'sl-']

/**
 * Resolve a bare CSS variable name to a {@link ThemePalette} slot, or `undefined`.
 *
 * The SINGLE definition of the name→slot resolution order, shared by the base-vars and
 * media-query passes (so they cannot drift):
 *  1. user-supplied `varAliases` (applied first, by lower-cased name),
 *  2. the exact / spelling-folded canonical name against `VAR_TO_SLOT`,
 *  3. a known-framework-prefix strip, then canonical lookup,
 *  4. a generic first-word-segment strip, then canonical lookup.
 */
function resolveSlot (name: string, varAliases: Record<string, string>): keyof ThemePalette | undefined {
	const lcName = name.toLowerCase()
	if (varAliases[lcName]) return varAliases[lcName] as keyof ThemePalette
	for (const cand of canonicalVarName(name)) {
		if (VAR_TO_SLOT[cand]) return VAR_TO_SLOT[cand]
	}
	for (const prefix of KNOWN_PREFIXES) {
		if (lcName.startsWith(prefix)) {
			const stripped = lcName.slice(prefix.length)
			for (const cand of canonicalVarName(stripped)) {
				if (VAR_TO_SLOT[cand]) return VAR_TO_SLOT[cand]
			}
		}
	}
	const dashIdx = lcName.indexOf('-')
	if (dashIdx > 0) {
		const afterPrefix = lcName.slice(dashIdx + 1)
		for (const cand of canonicalVarName(afterPrefix)) {
			if (VAR_TO_SLOT[cand]) return VAR_TO_SLOT[cand]
		}
	}
	return undefined
}

/** Return type for {@link parseCssVars}: base vars plus media-query scoped vars. */
interface ParsedCssVars {
	vars: Record<string, string>
	darkVars: Record<string, string>
	lightVars: Record<string, string>
}

/**
 * Extract `--name: value;` custom-property declarations from CSS text.
 * Prefers declarations inside `:root { … }` blocks; if none are found, falls back to scanning
 * the entire string (covers inline/style-block custom props without a `:root` selector).
 * Also extracts vars declared inside `@media (prefers-color-scheme: dark|light)` blocks.
 * @returns base vars, dark media-query vars, and light media-query vars
 */
function parseCssVars (css: string): ParsedCssVars {
	const out: Record<string, string> = {}
	const darkVars: Record<string, string> = {}
	const lightVars: Record<string, string> = {}
	const declRegex = /--([\w-]+)\s*:\s*([^;}\n]+)/g

	const collect = (text: string, target: Record<string, string>): void => {
		let m: RegExpExecArray | null
		while ((m = declRegex.exec(text)) !== null) {
			target[m[1].trim().toLowerCase()] = m[2].trim()
		}
	}

	// 1) Scan whole CSS for custom-prop declarations (baseline)
	declRegex.lastIndex = 0
	collect(css, out)

	// 2) :root blocks override (there can be more than one) — same-name vars take precedence
	const rootRegex = /:root\s*\{([^}]*)\}/g
	let rootMatch: RegExpExecArray | null
	while ((rootMatch = rootRegex.exec(css)) !== null) {
		declRegex.lastIndex = 0
		collect(rootMatch[1], out)
	}

	// 3) @media (prefers-color-scheme: dark|light) blocks
	const mediaRegex = /@media\s*\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)\s*\{([\s\S]*?)\n\}/g
	let mediaMatch: RegExpExecArray | null
	while ((mediaMatch = mediaRegex.exec(css)) !== null) {
		const scheme = mediaMatch[1]
		const target = scheme === 'dark' ? darkVars : lightVars
		declRegex.lastIndex = 0
		collect(mediaMatch[2], target)
	}

	return { vars: out, darkVars, lightVars }
}

/**
 * Parse CSS `:root` custom properties into a theme palette, falling back to a preset for any
 * slot not present in the CSS. v2 additionally resolves `var()` references, parses `rgb()/rgba()`,
 * computes derived colours (`cardLine`/`cardFill`/`barStops`), and attaches `presetName`/`vars`.
 * @param {string} css - CSS text (or any text containing `--name: value;` declarations)
 * @param {ExtractThemeOptions} [options] - presets, fallback, and the v2 converter-equivalence flags
 * @returns {ThemePalette} the resolved palette (always complete — preset fills the gaps)
 * @example
 * const theme = extractThemeFromCSS(':root{ --bg:#121218; --accent:#7C3AED; }')
 * // => { bg: '121218', accent: '7C3AED', cardLine: '301D54', barStops: [...], presetName: 'extracted', ... }
 *
 * // Deck-specific hue-named vars (e.g. --purple) are NOT auto-mapped to accent — only abstract
 * // role names (accent/primary/brand/…) are. Route a hue-named var explicitly via varAliases:
 * const t2 = extractThemeFromCSS(':root{ --bg:#121218; --purple:#7C3AED; }', { varAliases: { purple: 'accent' } })
 * // => { bg: '121218', accent: '7C3AED', ... }
 */
export function extractThemeFromCSS (css: string, options: ExtractThemeOptions = {}): ThemePalette {
	const presets: Record<string, Partial<ThemePalette>> = { dark: DARK_PRESET, light: LIGHT_PRESET, ...(options.presets || {}) }
	const fallbackName = options.defaultPreset && presets[options.defaultPreset] ? options.defaultPreset : 'dark'
	const derivedColors = options.derivedColors !== false
	const resolveVarRefs = options.resolveVarRefs !== false
	const parseRgb = options.parseRgb !== false
	const barGradientVar = options.barGradientVar || '--bar-gradient'
	const scanFontFamily = options.scanFontFamily !== false
	const fontFamilySelectors = options.fontFamilySelectors || DEFAULT_FONT_SELECTORS

	const parsed = (typeof css === 'string' && css.length > 0) ? parseCssVars(css) : { vars: {}, darkVars: {}, lightVars: {} }
	const vars: Record<string, string> = parsed.vars
	const { darkVars, lightVars } = parsed
	const varAliases = options.varAliases || {}
	// Track which slots were explicitly extracted from CSS (not preset)
	const extractedSlots = new Set<string>()
	// Track which slots were derived (computed from other values)
	const derivedSlots = new Set<string>()

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
		let fontFromVar = false
		Object.keys(vars).forEach(name => {
			// 5a/5e: shared name→slot resolution (varAliases → canonical → prefix-strip → dash-strip).
			const slot = resolveSlot(name, varAliases)
			if (!slot) return
			let value = vars[name]
			if (resolveVarRefs) value = resolveVar(value, vars)
			if (slot === 'font' || !COLOR_SLOTS.has(slot)) {
				matched++
				if (slot === 'font') fontFromVar = true
				extractedSlots.add(slot as string)
				theme[slot] = normalizeFont(value)
			} else {
				// SAU-46: only adopt a colour slot when the value normalises to valid 6-hex.
				// Unparseable functions (e.g. malformed lab()/color()) are left for the preset
				// to repair rather than polluting the slot with verbatim text.
				const hex = normalizeColor(value).slice(0, 6)
				if (/^[0-9A-F]{6}$/i.test(hex)) {
					matched++
					extractedSlots.add(slot as string)
					theme[slot] = hex
				}
			}
		})

		// 5b: Fallback chain — scan body{}/html{} for background/color when bg/text not from vars
		if (typeof css === 'string' && css.length > 0) {
			const bodyHtmlRegex = /(?:body|html)\s*\{([^}]*)\}/gi
			let bm: RegExpExecArray | null
			while ((bm = bodyHtmlRegex.exec(css)) !== null) {
				const block = bm[1]
				if (!extractedSlots.has('bg')) {
					const bgMatch = block.match(/(?:background-color|background)\s*:\s*([^;]+)/i)
					if (bgMatch) {
						const val = normalizeColor(bgMatch[1].trim())
						if (/^[0-9A-F]{6}$/.test(val)) {
							theme.bg = val
							extractedSlots.add('bg')
							matched++
						}
					}
				}
				if (!extractedSlots.has('text')) {
					const colorMatch = block.match(/(?:^|[^-\w])color\s*:\s*([^;]+)/i)
					if (colorMatch) {
						const val = normalizeColor(colorMatch[1].trim())
						if (/^[0-9A-F]{6}$/.test(val)) {
							theme.text = val
							extractedSlots.add('text')
							matched++
						}
					}
				}
			}
		}

		// Gap 2: when no explicit `--font*` var set the font, adopt a scanned `font-family:` family.
		// An explicit `--font*` var ALWAYS wins over a scanned declaration.
		if (!fontFromVar && scanFontFamily) {
			const scanned = scanFontFamilyDeclarations(css, fontFamilySelectors)
			if (scanned) theme.font = normalizeFont(scanned)
		}
		presetName = matched > 0 ? 'extracted' : fallbackName

		// 5c: Light/dark inference — only when caller did NOT explicitly provide defaultPreset
		if (presetName === 'extracted' && !options.defaultPreset) {
			let inferLight = false
			if (extractedSlots.has('bg')) {
				const bgLum = relativeLuminance(theme.bg)
				if (bgLum > 0.5) inferLight = true
			} else if (extractedSlots.has('text')) {
				const textLum = relativeLuminance(theme.text)
				if (textLum < 0.4) inferLight = true
			}
			if (inferLight) {
				// Fill unfilled slots from LIGHT_PRESET instead of the dark fallback
				for (const key of Object.keys(LIGHT_PRESET) as (keyof ThemePalette)[]) {
					if (!extractedSlots.has(key as string) && key !== 'font') {
						(theme as any)[key] = LIGHT_PRESET[key]
					}
				}
			}
		}

		// 5d: Anti-Frankenstein — recalculate surfaceRaised when both bg and text extracted
		if (extractedSlots.has('bg') && extractedSlots.has('text') && !extractedSlots.has('surfaceRaised')) {
			theme.surfaceRaised = mixColors(theme.bg, theme.text, 0.07)
			derivedSlots.add('surfaceRaised')
		}

		// 5f: Media-query overlay — apply prefers-color-scheme vars matching detected mode
		const inferredMode = (() => {
			if (options.defaultPreset === 'light' || options.defaultPreset === 'dark') return options.defaultPreset
			if (extractedSlots.has('bg')) return relativeLuminance(theme.bg) > 0.5 ? 'light' : 'dark'
			return 'dark'
		})()
		const mediaVars = inferredMode === 'dark' ? darkVars : lightVars
		if (Object.keys(mediaVars).length > 0) {
			Object.keys(mediaVars).forEach(name => {
				const slot = resolveSlot(name, varAliases)
				if (!slot) return
				let value = mediaVars[name]
				if (resolveVarRefs) value = resolveVar(value, { ...vars, ...mediaVars })
				if (slot === 'font' || !COLOR_SLOTS.has(slot)) {
					extractedSlots.add(slot as string)
					theme[slot] = normalizeFont(value)
				} else {
					// SAU-46: only adopt valid 6-hex (see base-pass guard above).
					const hex = normalizeColor(value).slice(0, 6)
					if (/^[0-9A-F]{6}$/i.test(hex)) {
						extractedSlots.add(slot as string)
						theme[slot] = hex
					}
				}
			})
		}
	}

	// ── Accent palette extraction ──────────────────────────────────────────────────
	// SAU-62/SAU-37: rank candidate hues by APPLIED usage prominence, not name alone. A
	// hue-named var (`--orange`) or a literal can lead when it is used more prominently than
	// the abstract/secondary palette. `count` carries the prominence weight; `ordinal` still
	// pins explicitly-named accent vars (accent-1, secondary, …) ahead of unranked hues.
	const ACCENT_NUMBERED_RE = /^(?:accent|color-accent|brand|primary)[-_]?(\d)$/
	interface AccentCandidate { hex: string; ordinal?: number; count: number }
	const accentVarNames = Object.keys(vars)
	// Prominence: how each colour is actually applied across the CSS (var refs + literals).
	const prominence = tallyColorProminence(css, vars, resolveVarRefs)
	// Did the deck declare an ABSTRACT accent (role-generic name → accent slot), as opposed to
	// only hue-named vars? When it did, the abstract accent wins (back-compat); when it did not,
	// the most-prominent saturated hue is promoted to the accent slot.
	let abstractAccentDeclared = false
	for (const name of accentVarNames) {
		const lcName = name.toLowerCase()
		if (varAliases[lcName] === 'accent') { abstractAccentDeclared = true; break }
		let mapped = false
		for (const cand of canonicalVarName(name)) {
			if (VAR_TO_SLOT[cand] === 'accent') { mapped = true; break }
		}
		if (!mapped && ACCENT_NUMBERED_RE.test(lcName)) mapped = true
		if (mapped) { abstractAccentDeclared = true; break }
	}
	// Background / text hexes are excluded from accent promotion (an accent is neither).
	const bgHex = (theme.bg || '').toUpperCase()
	const textHex = (theme.text || '').toUpperCase()
	const surfaceHex = (theme.surface || '').toUpperCase()
	// Prominence weight for a var, crediting any var that aliases to the same hex.
	const promForHex = (hex: string): number => prominence.get(hex.toUpperCase()) || 0

	const accentCandidates: AccentCandidate[] = []
	const pushHexCandidate = (hex: string, ordinal: number | undefined): void => {
		if (!/^[0-9A-F]{6}$/i.test(hex)) return
		accentCandidates.push({ hex: hex.toUpperCase(), ordinal, count: promForHex(hex) })
	}
	// 1) Explicitly-named accent vars keep their ordinal (abstract accent / accent-N / secondary / tertiary).
	for (const name of accentVarNames) {
		const lcName = name.toLowerCase()
		let ordinal: number | undefined
		if (extractedSlots.has('accent')) {
			let mappedSlot: string | undefined
			if (varAliases[lcName]) mappedSlot = varAliases[lcName]
			else {
				for (const cand of canonicalVarName(name)) {
					if (VAR_TO_SLOT[cand] === 'accent') { mappedSlot = 'accent'; break }
				}
			}
			if (mappedSlot === 'accent') ordinal = 1
		}
		if (ordinal === undefined) {
			const mm = ACCENT_NUMBERED_RE.exec(lcName)
			if (mm) ordinal = parseInt(mm[1], 10)
			else if (lcName === 'secondary') ordinal = 2
			else if (lcName === 'tertiary') ordinal = 3
			else if (/^(?:accent|color-accent|brand|primary)$/i.test(lcName)) ordinal = undefined
			else continue // handled in pass 2 (prominence)
		}
		let value = vars[name]
		if (resolveVarRefs) value = resolveVar(value, vars)
		pushHexCandidate(normalizeColor(value).slice(0, 6), ordinal)
	}
	// 2) Prominence pass — EVERY saturated, non-bg/non-text colour applied in the CSS is a
	//    candidate, whether it came from a hue-named var (`--orange`) or a literal. Ranked by
	//    applied weight so the deck's lead accent surfaces over an incidental/secondary hue.
	const SATURATION_MIN = 0.25
	for (const [hex, weight] of prominence) {
		if (hex === bgHex || hex === textHex || hex === surfaceHex) continue
		if (hexSaturation(hex) < SATURATION_MIN) continue
		if (weight <= 0) continue
		accentCandidates.push({ hex, ordinal: undefined, count: weight })
	}
	// Deduplicate by normalized hex (keep lower ordinal; else higher prominence count).
	const seenHex = new Map<string, AccentCandidate>()
	for (const c of accentCandidates) {
		const existing = seenHex.get(c.hex)
		if (!existing) { seenHex.set(c.hex, c); continue }
		if (c.ordinal !== undefined && (existing.ordinal === undefined || c.ordinal < existing.ordinal)) {
			seenHex.set(c.hex, { ...existing, ordinal: c.ordinal, count: Math.max(existing.count, c.count) })
		} else if (c.count > existing.count) {
			seenHex.set(c.hex, { ...existing, count: c.count })
		}
	}
	const deduped = [...seenHex.values()]
	// Sort: explicit ordinal first (ascending), then by applied prominence descending, then hex
	// for determinism. When no abstract accent was declared, ordinals are absent so prominence
	// alone decides the lead — this is what makes `--orange` (17 uses) beat `--purple` (8 uses).
	deduped.sort((a, b) => {
		if (a.ordinal !== undefined && b.ordinal !== undefined) return a.ordinal - b.ordinal
		if (a.ordinal !== undefined) return -1
		if (b.ordinal !== undefined) return 1
		if (b.count !== a.count) return b.count - a.count
		return a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0
	})
	// Promote the most-prominent saturated hue to the accent slot when the deck declared NO
	// abstract accent var (the load-bearing SAU-37 fix). When an abstract accent IS declared it
	// already filled the slot, so we leave it (back-compat).
	if (!abstractAccentDeclared && !extractedSlots.has('accent') && deduped.length > 0) {
		const lead = deduped[0].hex
		if (/^[0-9A-F]{6}$/i.test(lead)) {
			theme.accent = lead
			extractedSlots.add('accent')
		}
	}
	if (deduped.length > 0) {
		theme.accents = deduped.slice(0, 6).map(c => c.hex)
		// Ensure accent === accents[0] invariant: accents[0] must match the resolved theme.accent
		const accentUpper = theme.accent.toUpperCase()
		const arr0Upper = theme.accents[0].toUpperCase()
		if (arr0Upper !== accentUpper) {
			// Move the matching entry to front, or prepend theme.accent
			const idx = theme.accents.findIndex(h => h.toUpperCase() === accentUpper)
			if (idx > 0) {
				theme.accents.splice(idx, 1)
				theme.accents.unshift(theme.accent)
			} else if (idx === -1) {
				theme.accents.unshift(theme.accent)
			}
			theme.accents = theme.accents.slice(0, 6)
		} else if (theme.accents[0] !== theme.accent) {
			// Case matches semantically but not literally — replace with exact value
			theme.accents[0] = theme.accent
		}
		extractedSlots.add('accents')
	} else {
		// Use preset default
		const base = presets[fallbackName] || DARK_PRESET
		theme.accents = (base as ThemePalette).accents || DARK_PRESET.accents
	}

	if (derivedColors) {
		theme.cardLine = mixColors(theme.accent, theme.bg, 0.72)
		theme.cardFill = mixColors(theme.surfaceRaised, theme.bg, 0.4)
		theme.barStops = deriveBarStops(vars, theme, barGradientVar, resolveVarRefs, parseRgb)
		derivedSlots.add('cardLine')
		derivedSlots.add('cardFill')
		derivedSlots.add('barStops')

		// 5d: Safety check — nudge derived colours too close to bg toward text (only when both extracted)
		if (extractedSlots.has('bg') && extractedSlots.has('text')) {
			const bgLum = relativeLuminance(theme.bg)
			const textHex = theme.text
			for (const slot of ['cardFill', 'cardLine'] as const) {
				const val = theme[slot]
				if (val && /^[0-9A-F]{6}$/i.test(val)) {
					const slotLum = relativeLuminance(val)
					if (Math.abs(slotLum - bgLum) < 0.1) {
						theme[slot] = mixColors(val, textHex, 0.15)
					}
				}
			}
		}
	}

	theme.presetName = presetName
	theme.vars = vars

	// Build per-slot provenance map
	const slotSource: Record<string, 'extracted' | 'derived' | 'preset'> = {}
	for (const key of Object.keys(theme)) {
		if (key === 'presetName' || key === 'vars' || key === 'slotSource') continue
		if (derivedSlots.has(key)) slotSource[key] = 'derived'
		else if (extractedSlots.has(key)) slotSource[key] = 'extracted'
		else slotSource[key] = 'preset'
	}
	theme.slotSource = slotSource

	return theme
}

export default extractThemeFromCSS
