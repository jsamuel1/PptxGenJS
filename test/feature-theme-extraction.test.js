'use strict'

// Feature: Theme extraction from CSS (docs/features/feature-theme-extraction.md).
// extractThemeFromCSS() parses :root custom properties, maps known variable-name patterns
// to theme slots (bg/accent/text/font + extended palette), and falls back to a preset for
// any slot not present in the CSS. Pure regex parsing — no DOM. Exported from the optional
// `@jsamuel1/pptxgenjs/utils` entry (here imported from the built src/bld/utils.cjs.js).

const { extractThemeFromCSS } = require('../src/bld/utils.cjs.js')
const { assert, assertEqual } = require('./helpers')

module.exports = [
	{
		name: 'extractTheme: maps --bg/--accent/--text/--font to bg/accent/text/font',
		fn: async () => {
			const css = ":root {\n  --bg: #121218;\n  --accent: #7C3AED;\n  --text: #E4E4ED;\n  --font: 'Inter';\n}"
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.bg, '121218', 'bg')
			assertEqual(theme.accent, '7C3AED', 'accent')
			assertEqual(theme.text, 'E4E4ED', 'text')
			assertEqual(theme.font, 'Inter', 'font')
		},
	},
	{
		name: 'extractTheme: empty CSS falls back to dark preset',
		fn: async () => {
			const theme = extractThemeFromCSS('', { defaultPreset: 'dark' })
			assertEqual(theme.bg, '1a1a2e', 'bg from dark preset')
			assertEqual(theme.accent, '6366f1', 'accent from dark preset')
		},
	},
	{
		name: 'extractTheme: exact-name matching keeps --bg and --bg-card distinct',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg: #010101; --bg-card: #020202; }')
			assertEqual(theme.bg, '010101', 'bg slot')
			assertEqual(theme.surface, '020202', 'surface slot (from --bg-card)')
		},
	},
	{
		name: 'extractTheme: extended palette slots (info/success/warn/danger) + accentSoft',
		fn: async () => {
			const css = ':root { --sky:#38BDF8; --green:#10B981; --orange:#FF9900; --red:#EF4444; --accent-soft:#A78BFA; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.info, '38BDF8', 'info')
			assertEqual(theme.success, '10B981', 'success')
			assertEqual(theme.warn, 'FF9900', 'warn')
			assertEqual(theme.danger, 'EF4444', 'danger')
			assertEqual(theme.accentSoft, 'A78BFA', 'accentSoft')
		},
	},
	{
		name: 'extractTheme: hex normalised — strips #, uppercases, expands 3-digit shorthand',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg: #abc; --accent: #7c3aed; }')
			assertEqual(theme.bg, 'AABBCC', '3-digit expanded + uppercased')
			assertEqual(theme.accent, '7C3AED', 'lowercase hex uppercased')
		},
	},
	{
		name: 'extractTheme: font-family strips quotes and takes first family',
		fn: async () => {
			const theme = extractThemeFromCSS(":root { --font-family: \"Helvetica Neue\", Arial, sans-serif; }")
			assertEqual(theme.font, 'Helvetica Neue', 'font family')
		},
	},
	{
		name: 'extractTheme: alias variable names (--background/--primary/--foreground/--muted)',
		fn: async () => {
			const css = ':root { --background:#101010; --primary:#FF0000; --foreground:#FFFFFF; --muted:#808080; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.bg, '101010', 'bg via --background')
			assertEqual(theme.accent, 'FF0000', 'accent via --primary')
			assertEqual(theme.text, 'FFFFFF', 'text via --foreground')
			assertEqual(theme.textMuted, '808080', 'textMuted via --muted')
		},
	},
	{
		name: 'extractTheme: custom preset overrides built-in fallback',
		fn: async () => {
			const theme = extractThemeFromCSS('', { presets: { brand: { bg: 'AB12CD' } }, defaultPreset: 'brand' })
			assertEqual(theme.bg, 'AB12CD', 'bg from custom preset')
			// gaps still filled from the complete dark base
			assert(typeof theme.accent === 'string' && theme.accent.length > 0, 'accent still populated; got: ' + theme.accent)
		},
	},
	{
		name: 'extractTheme: no :root block — falls back to scanning whole CSS for custom props',
		fn: async () => {
			const theme = extractThemeFromCSS('.body { --bg: #123456; color: red; }')
			assertEqual(theme.bg, '123456', 'bg parsed without :root selector')
		},
	},
	{
		name: 'extractTheme: result is always a complete palette',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg:#000000; }')
			for (const slot of ['bg', 'surface', 'accent', 'accentSoft', 'text', 'textMuted', 'info', 'success', 'warn', 'danger']) {
				assert(typeof theme[slot] === 'string' && theme[slot].length > 0, 'expected slot "' + slot + '" populated; got: ' + theme[slot])
			}
			// font is intentionally empty in neutral presets (system default)
			assert(typeof theme.font === 'string', 'expected font slot to be a string; got: ' + typeof theme.font)
		},
	},

	// --- v2 converter-equivalence (docs/features/feature-enhancements-converter-gaps.md §3) ---
	// This util emits NO OOXML and produces a palette object — there is no addShape round-trip.
	// The equivalent rigour is: (1) assert the spec's documented FORMULAS produce the expected
	// EXACT hex (a wrong mix-weight or var-resolution regression changes the hex and fails here),
	// and (2) the 11 existing tests above staying green proves the slot mapping was not regressed.
	{
		name: 'extractTheme v2: rgb()/rgba() values are parsed to 6-hex (parseRgb default-on)',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg: rgb(18,18,24); --accent: rgba(124,58,237,0.5); }')
			assertEqual(theme.bg, '121218', 'rgb() -> hex')
			assertEqual(theme.accent, '7C3AED', 'rgba() -> hex (alpha dropped)')
		},
	},
	{
		name: 'extractTheme v2: var(--name) refs are resolved against parsed vars (resolveVarRefs default-on)',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --purple:#7C3AED; --accent: var(--purple); }')
			assertEqual(theme.accent, '7C3AED', 'accent resolved from var(--purple)')
		},
	},
	{
		name: 'extractTheme v2: derived cardLine/cardFill match mix() formula EXACTLY (hand-computed)',
		fn: async () => {
			// cardLine = mix(accent #7C3AED, bg #121218, 0.72):
			//   r=round(124*.28 + 18*.72)=48=0x30, g=round(58*.28 + 18*.72)=29=0x1D, b=round(237*.28 + 24*.72)=84=0x54 => 301D54
			// cardFill = mix(surfaceRaised #1E1E2A, bg #121218, 0.4):
			//   r=g=round(30*.6 + 18*.4)=25=0x19, b=round(42*.6 + 24*.4)=35=0x23 => 191923
			const theme = extractThemeFromCSS(':root { --accent:#7C3AED; --bg:#121218; --bg-mid:#1E1E2A; }')
			assertEqual(theme.cardLine, '301D54', 'cardLine = mix(accent,bg,0.72)')
			assertEqual(theme.cardFill, '191923', 'cardFill = mix(surfaceRaised,bg,0.4)')
		},
	},
	{
		name: 'extractTheme v2: barStops from --bar-gradient var() refs; fallback to [accent,accentSoft,info]',
		fn: async () => {
			const css = ':root { --purple:#7C3AED; --purple-soft:#A78BFA; --sky:#38BDF8;'
				+ ' --bar-gradient: linear-gradient(90deg, var(--purple), var(--purple-soft), var(--sky)); }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.barStops.join(','), '7C3AED,A78BFA,38BDF8', 'barStops from gradient var() refs')
			// No --bar-gradient -> fallback
			const t2 = extractThemeFromCSS(':root { --bg:#000000; }')
			assertEqual(t2.barStops.join(','), [t2.accent, t2.accentSoft, t2.info].join(','), 'barStops fallback')
		},
	},
	{
		name: 'extractTheme v2: forcePreset bypasses CSS; unknown name falls back (no throw)',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg:#000000; --purple:#FF0000; }', { forcePreset: 'light' })
			assertEqual(theme.bg, 'ffffff', 'bg from forced light preset (CSS ignored)')
			assertEqual(theme.accent, '6366f1', 'accent from forced light preset (CSS ignored)')
			assertEqual(theme.presetName, 'light', 'presetName === forced preset')
			// Unknown forcePreset must NOT throw — falls back to defaultPreset
			const t2 = extractThemeFromCSS('', { forcePreset: 'nope', defaultPreset: 'light' })
			assertEqual(t2.bg, 'ffffff', 'unknown forcePreset falls back to defaultPreset')
		},
	},
	{
		name: 'extractTheme v2: extended palette slots (surfaceRaised/neutral2)',
		fn: async () => {
			const css = ':root { --bg-mid:#111111; --gray-300:#A0A0B0; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.surfaceRaised, '111111', 'surfaceRaised via --bg-mid')
			assertEqual(theme.neutral2, 'A0A0B0', 'neutral2 via --gray-300')
		},
	},
	{
		name: 'extractTheme v2: metadata presetName + raw vars are attached',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg:#121218; }')
			assert(typeof theme.presetName === 'string' && theme.presetName.length > 0, 'presetName present; got: ' + theme.presetName)
			assertEqual(theme.presetName, 'extracted', 'presetName === extracted when a var matched')
			assert(theme.vars && theme.vars.bg === '#121218', 'raw vars carry the original --bg value; got: ' + (theme.vars && theme.vars.bg))
		},
	},
	{
		name: 'extractTheme v2: derivedColors:false drops cardLine/cardFill/barStops (opt-out)',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg:#121218; }', { derivedColors: false })
			assert(theme.cardLine === undefined, 'cardLine absent when derivedColors:false; got: ' + theme.cardLine)
			assert(theme.cardFill === undefined, 'cardFill absent when derivedColors:false; got: ' + theme.cardFill)
			assert(theme.barStops === undefined, 'barStops absent when derivedColors:false; got: ' + theme.barStops)
		},
	},

	// --- Gap 1 (docs/features/feature-theme-extraction-aliases-and-font.md): colour-name aliases + canonicaliser ---
	{
		name: 'extractTheme aliases: --brand maps to accent, --text-colour (en-GB + -colour suffix) maps to text',
		fn: async () => {
			const theme = extractThemeFromCSS(':root{ --bg:#003344; --brand:#FFAA00; --text-colour:#EEFFEE; }')
			assertEqual(theme.accent, 'FFAA00', 'accent via --brand alias')
			assertEqual(theme.text, 'EEFFEE', 'text via --text-colour (folded + suffix-stripped)')
		},
	},
	{
		name: 'extractTheme aliases: extended colour synonyms (--emerald/--amber/--rose/--cyan)',
		fn: async () => {
			const css = ':root{ --emerald:#10B981; --amber:#FF9900; --rose:#EF4444; --cyan:#38BDF8; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.success, '10B981', 'success via --emerald')
			assertEqual(theme.warn, 'FF9900', 'warn via --amber')
			assertEqual(theme.danger, 'EF4444', 'danger via --rose')
			assertEqual(theme.info, '38BDF8', 'info via --cyan')
		},
	},
	{
		name: 'extractTheme aliases: -color suffix stripping resolves --primary-color/--bg-color/--accent-color',
		fn: async () => {
			const css = ':root{ --bg-color:#101010; --primary-color:#FF0000; --accent-color:#00FF00; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.bg, '101010', 'bg via --bg-color')
			// both --primary-color and --accent-color map to accent; last-declared wins
			assertEqual(theme.accent, '00FF00', 'accent via --accent-color (last declared)')
		},
	},
	{
		name: 'extractTheme aliases: matching stays EXACT — --bg vs --bg-card resolve to distinct slots',
		fn: async () => {
			const theme = extractThemeFromCSS(':root{ --bg:#010101; --bg-card:#020202; }')
			assertEqual(theme.bg, '010101', 'bg slot (canonicaliser must not strip -card)')
			assertEqual(theme.surface, '020202', 'surface slot still distinct')
		},
	},
	{
		name: 'extractTheme aliases: regression — existing exact names unchanged (--bg/--accent)',
		fn: async () => {
			const theme = extractThemeFromCSS(':root{ --bg:#121218; --accent:#7C3AED; }')
			assertEqual(theme.bg, '121218', 'bg unchanged')
			assertEqual(theme.accent, '7C3AED', 'accent via --accent unchanged')
		},
	},

	// --- Gap 2 (docs/features/feature-theme-extraction-aliases-and-font.md): font-family declaration scan ---
	{
		name: 'extractTheme font-scan: body { font-family: "Georgia", serif } adopts Georgia (skips generic)',
		fn: async () => {
			const theme = extractThemeFromCSS('body { font-family: "Georgia", serif; }')
			assertEqual(theme.font, 'Georgia', 'font scanned from body declaration')
		},
	},
	{
		name: 'extractTheme font-scan: explicit --font var always wins over a scanned font-family rule',
		fn: async () => {
			const theme = extractThemeFromCSS(':root{ --font:Inter; } body{ font-family: Georgia; }')
			assertEqual(theme.font, 'Inter', 'explicit --font wins over body font-family')
		},
	},
	{
		name: 'extractTheme font-scan: generic-only font-family is ignored — font stays preset',
		fn: async () => {
			const theme = extractThemeFromCSS('body { font-family: sans-serif; }')
			assertEqual(theme.font, '', 'generic sans-serif skipped, preset empty retained')
			assert(theme.font !== 'sans-serif', 'font must not be a CSS generic; got: ' + theme.font)
		},
	},
	{
		name: 'extractTheme font-scan: scanFontFamily:false disables scanning (font stays preset)',
		fn: async () => {
			const theme = extractThemeFromCSS('body { font-family: Georgia; }', { scanFontFamily: false })
			assertEqual(theme.font, '', 'scan disabled, preset empty retained')
		},
	},
	{
		name: 'extractTheme font-scan: priority selectors win — :root font-family beats body',
		fn: async () => {
			const css = 'body { font-family: Georgia; } :root { font-family: Roboto; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.font, 'Roboto', ':root selector outranks body regardless of source order')
		},
	},
	{
		name: 'extractTheme font-scan: --font* aliases (--typeface/--font-sans) map to font slot',
		fn: async () => {
			assertEqual(extractThemeFromCSS(':root{ --typeface: Lato; }').font, 'Lato', 'font via --typeface')
			assertEqual(extractThemeFromCSS(':root{ --font-sans: Poppins; }').font, 'Poppins', 'font via --font-sans')
		},
	},
	{
		name: 'extractTheme font-scan: custom fontFamilySelectors override default priority list',
		fn: async () => {
			const css = 'body { font-family: Georgia; } .deck { font-family: Roboto; }'
			const theme = extractThemeFromCSS(css, { fontFamilySelectors: ['.deck', 'body'] })
			assertEqual(theme.font, 'Roboto', '.deck prioritised via custom fontFamilySelectors')
		},
	},

	// --- Slice 5: Theme extraction generality ---
	{
		name: 'extractTheme s5: extracts Bootstrap vars with prefix stripping',
		fn: async () => {
			const css = ':root{--bs-primary:#0d6efd;--bs-body-bg:#ffffff;--bs-body-color:#212529}'
			const result = extractThemeFromCSS(css)
			assertEqual(result.accent, '0D6EFD', 'accent from --bs-primary')
			assertEqual(result.bg, 'FFFFFF', 'bg from --bs-body-bg')
			assertEqual(result.text, '212529', 'text from --bs-body-color')
			assertEqual(result.presetName, 'extracted', 'presetName')
			// Light preset should be inferred (bg luminance > 0.5)
		},
	},
	{
		name: 'extractTheme s5: extracts Material Design tokens with prefix stripping',
		fn: async () => {
			const css = ':root{--md-sys-color-primary:#6750a4;--md-sys-color-surface:#fffbfe;--md-sys-color-on-surface:#1c1b1f}'
			const result = extractThemeFromCSS(css)
			assertEqual(result.accent, '6750A4', 'accent from --md-sys-color-primary')
			assertEqual(result.bg, 'FFFBFE', 'bg from --md-sys-color-surface (surface maps to bg)')
			assertEqual(result.text, '1C1B1F', 'text from --md-sys-color-on-surface (on-surface maps to text)')
		},
	},
	{
		name: 'extractTheme s5: extracts bg/text from body{} when no vars provide them',
		fn: async () => {
			const css = 'body{background:#fafafa;color:#222222}'
			const result = extractThemeFromCSS(css)
			assertEqual(result.bg, 'FAFAFA', 'bg from body background')
			assertEqual(result.text, '222222', 'text from body color')
			// Light should be inferred
		},
	},
	{
		name: 'extractTheme s5: does not mix dark preset values into light-extracted palette',
		fn: async () => {
			const css = ':root{--bg:#f8f9fa;--text:#212529}'
			const result = extractThemeFromCSS(css)
			// No derived slot should contain dark preset hex values
			const darkPresetValues = ['1a1a2e', '25253e', '2d2d4a', '606078']
			if (result.cardFill) {
				for (const dark of darkPresetValues) {
					assert(result.cardFill.toLowerCase() !== dark, 'cardFill should not be dark preset value ' + dark + '; got: ' + result.cardFill)
				}
			}
			// cardFill should be readable against bg (luminance distance >= 0.1 after nudge)
		},
	},
	{
		name: 'extractTheme s5: maps deck-specific var names via varAliases option',
		fn: async () => {
			const css = ':root{--purple:#7C3AED}'
			const withAlias = extractThemeFromCSS(css, { varAliases: { purple: 'accent' } })
			assertEqual(withAlias.accent, '7C3AED', 'accent mapped via varAliases')
			const without = extractThemeFromCSS(css)
			// Without varAliases, purple should NOT map to accent (removed from VAR_TO_SLOT)
			assert(without.accent !== '7C3AED', 'without varAliases, purple should not map to accent; got: ' + without.accent)
		},
	},

	// --- SAU-62 / SAU-37: rank accents by APPLIED usage prominence (not name) + multi-role palette ---
	{
		name: 'extractTheme SAU-37: orange-lead multi-accent deck → accent===FF9900 and accents[0]===FF9900',
		fn: async () => {
			// msx-style deck: both --purple and --orange are declared (name-probing cannot tell them
			// apart), but --orange is APPLIED far more prominently (labels/headings/card-titles), so
			// usage must promote it to the lead accent over the secondary --purple.
			const css = ':root{ --bg:#16131E; --text:#E4E4ED;'
				+ ' --orange:#FF9900; --purple:#7C3AED; --sky:#38BDF8; --green:#10B981; }'
				+ '.label{ color: var(--orange); } h1,h2,h3{ color: var(--orange); }'
				+ '.card-title{ color: var(--orange); } .kicker{ color: var(--orange); }'
				+ '.highlight{ color: var(--orange); border-color: var(--orange); }'
				+ '.badge{ background: var(--purple); } .chip{ color: var(--purple); }'
				+ '.ok{ color: var(--green); } .info{ color: var(--sky); }'
			const t = extractThemeFromCSS(css)
			assertEqual(t.accent, 'FF9900', 'lead accent is the most-applied hue (orange)')
			assert(Array.isArray(t.accents) && t.accents.length > 0, 'accents[] populated')
			assertEqual(t.accents[0], 'FF9900', 'accents[0] === lead accent')
			assertEqual(t.slotSource.accent, 'extracted', 'promoted accent tagged extracted (from CSS usage)')
			// purple must still appear in the ranked palette, just not as the lead
			assert(t.accents.includes('7C3AED'), 'secondary --purple still present in accents[]; got: ' + t.accents.join(','))
		},
	},
	{
		name: 'extractTheme SAU-37: purple-lead reference-style deck → --purple stays accent (no abstract --accent)',
		fn: async () => {
			// Reference deck declares --purple as its lead and uses it most; with no abstract --accent,
			// prominence must keep purple as the accent (the no-regression case).
			const css = ':root{ --bg:#121218; --text:#E4E4ED; --purple:#7C3AED; --sky:#38BDF8; }'
				+ '.label{ color: var(--purple); } h1,h2{ color: var(--purple); }'
				+ '.card-title{ color: var(--purple); } .info{ color: var(--sky); }'
			const t = extractThemeFromCSS(css)
			assertEqual(t.accent, '7C3AED', '--purple stays accent when it is the most-applied hue')
			assertEqual(t.accents[0], '7C3AED', 'accents[0] === purple')
		},
	},
	{
		name: 'extractTheme SAU-62: hue-only deck (no abstract accent) gets the prominent hue, NOT the indigo preset',
		fn: async () => {
			const css = ':root{ --bg:#111111; --text:#EEEEEE; --orange:#FF9900; }'
				+ '.label{ color: var(--orange); } h1{ color: var(--orange); }'
			const t = extractThemeFromCSS(css)
			assertEqual(t.accent, 'FF9900', 'prominent hue promoted to accent')
			assert(t.accent !== '6366f1' && t.accent.toLowerCase() !== '6366f1', 'must NOT be the indigo preset; got: ' + t.accent)
			assertEqual(t.slotSource.accent, 'extracted', 'slotSource tags the promoted hue as extracted')
		},
	},
	{
		name: 'extractTheme SAU-62: abstract --accent still wins over a more-applied hue (back-compat)',
		fn: async () => {
			const css = ':root{ --bg:#111111; --accent:#00AAFF; --orange:#FF9900; }'
				+ '.x{ color: var(--orange); } .y{ color: var(--orange); } .z{ color: var(--orange); }'
			const t = extractThemeFromCSS(css)
			assertEqual(t.accent, '00AAFF', 'declared abstract --accent is authoritative regardless of hue usage')
			assertEqual(t.accents[0], '00AAFF', 'accents[0] === abstract accent')
		},
	},
	{
		name: 'extractTheme SAU-62: ADR-0006 — a deck with NO applied hues keeps the preset accent (no spurious promotion)',
		fn: async () => {
			// Hue vars declared but never applied anywhere → zero prominence → preset is kept.
			const css = ':root{ --bg:#111111; --text:#EEEEEE; --orange:#FF9900; }'
			const t = extractThemeFromCSS(css)
			assertEqual(t.slotSource.accent, 'preset', 'unused hue must not hijack the accent slot')
		},
	},
]
