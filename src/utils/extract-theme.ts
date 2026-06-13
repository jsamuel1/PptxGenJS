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
	/** Derived gradient-bar stops: from `--bar-gradient` var() refs, else `[accent, accentSoft, info]`. */
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
 * Extract `--name: value;` custom-property declarations from CSS text.
 * Prefers declarations inside `:root { … }` blocks; if none are found, falls back to scanning
 * the entire string (covers inline/style-block custom props without a `:root` selector).
 * @returns map of bare variable name (no leading `--`) -> value
 */
function parseCssVars (css: string): Record<string, string> {
	const out: Record<string, string> = {}
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
	const scanFontFamily = options.scanFontFamily !== false
	const fontFamilySelectors = options.fontFamilySelectors || DEFAULT_FONT_SELECTORS

	const vars: Record<string, string> = (typeof css === 'string' && css.length > 0) ? parseCssVars(css) : {}
	const varAliases = options.varAliases || {}
	// Track which slots were explicitly extracted from CSS (not preset)
	const extractedSlots = new Set<string>()

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
			let slot: keyof ThemePalette | undefined
			// 5e: varAliases applied BEFORE VAR_TO_SLOT lookup
			const lcName = name.toLowerCase()
			if (varAliases[lcName]) {
				slot = varAliases[lcName] as keyof ThemePalette
			} else {
				// 5a: try canonical name, then prefix-stripped canonical name
				for (const cand of canonicalVarName(name)) {
					if (VAR_TO_SLOT[cand]) { slot = VAR_TO_SLOT[cand]; break }
				}
				if (!slot) {
					// Strip known framework prefixes and retry
					for (const prefix of KNOWN_PREFIXES) {
						if (lcName.startsWith(prefix)) {
							const stripped = lcName.slice(prefix.length)
							for (const cand of canonicalVarName(stripped)) {
								if (VAR_TO_SLOT[cand]) { slot = VAR_TO_SLOT[cand]; break }
							}
							if (slot) break
						}
					}
				}
			}
			if (!slot) return
			matched++
			if (slot === 'font') fontFromVar = true
			extractedSlots.add(slot as string)
			let value = vars[name]
			if (resolveVarRefs) value = resolveVar(value, vars)
			theme[slot] = slot === 'font' || !COLOR_SLOTS.has(slot) ? normalizeFont(value) : normalizeColor(value, parseRgb)
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
						const val = normalizeColor(bgMatch[1].trim(), parseRgb)
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
						const val = normalizeColor(colorMatch[1].trim(), parseRgb)
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
		}
	}

	if (derivedColors) {
		theme.cardLine = mixColors(theme.accent, theme.bg, 0.72)
		theme.cardFill = mixColors(theme.surfaceRaised, theme.bg, 0.4)
		theme.barStops = deriveBarStops(vars, theme, barGradientVar, resolveVarRefs, parseRgb)

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

	return theme
}

export default extractThemeFromCSS
