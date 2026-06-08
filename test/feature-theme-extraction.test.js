'use strict'

// Feature: Theme extraction from CSS (docs/feature-theme-extraction.md).
// extractThemeFromCSS() parses :root custom properties, maps known variable-name patterns
// to theme slots (bg/accent/text/font + extended palette), and falls back to a preset for
// any slot not present in the CSS. Pure regex parsing — no DOM. Exported from the optional
// `@jsamuel1/pptxgenjs/utils` entry (here imported from the built src/bld/utils.cjs.js).

const { extractThemeFromCSS } = require('../src/bld/utils.cjs.js')
const { assert, assertEqual } = require('./helpers')

module.exports = [
	{
		name: 'extractTheme: maps --bg/--purple/--white/--font to bg/accent/text/font',
		fn: async () => {
			const css = ":root {\n  --bg: #121218;\n  --purple: #7C3AED;\n  --white: #E4E4ED;\n  --font: 'Inter';\n}"
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
			assertEqual(theme.bg, '121218', 'bg from dark preset')
			assertEqual(theme.accent, '7C3AED', 'accent from dark preset')
		},
	},
	{
		name: 'extractTheme: exact-name matching keeps --bg and --bg-card distinct',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg: #010101; --bg-card: #020202; }')
			assertEqual(theme.bg, '010101', 'bg slot')
			assertEqual(theme.bgSecondary, '020202', 'bgSecondary slot (from --bg-card)')
		},
	},
	{
		name: 'extractTheme: extended palette slots (sky/green/orange/red) + accentSoft',
		fn: async () => {
			const css = ':root { --sky:#38BDF8; --green:#10B981; --orange:#FF9900; --red:#EF4444; --accent-soft:#A78BFA; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.sky, '38BDF8', 'sky')
			assertEqual(theme.green, '10B981', 'green')
			assertEqual(theme.orange, 'FF9900', 'orange')
			assertEqual(theme.red, 'EF4444', 'red')
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
			assertEqual(theme.textSecondary, '808080', 'textSecondary via --muted')
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
			for (const slot of ['bg', 'bgSecondary', 'accent', 'accentSoft', 'text', 'textSecondary', 'font', 'sky', 'green', 'orange', 'red']) {
				assert(typeof theme[slot] === 'string' && theme[slot].length > 0, 'expected slot "' + slot + '" populated; got: ' + theme[slot])
			}
		},
	},

	// --- v2 converter-equivalence (docs/feature-enhancements-converter-gaps.md §3) ---
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
			// cardFill = mix(bgMid #1E1E2A, bg #121218, 0.4):
			//   r=g=round(30*.6 + 18*.4)=25=0x19, b=round(42*.6 + 24*.4)=35=0x23 => 191923
			const theme = extractThemeFromCSS(':root { --accent:#7C3AED; --bg:#121218; --bg-mid:#1E1E2A; }')
			assertEqual(theme.cardLine, '301D54', 'cardLine = mix(accent,bg,0.72)')
			assertEqual(theme.cardFill, '191923', 'cardFill = mix(bgMid,bg,0.4)')
		},
	},
	{
		name: 'extractTheme v2: barStops from --bar-gradient var() refs; fallback to [accent,accentSoft,sky]',
		fn: async () => {
			const css = ':root { --purple:#7C3AED; --purple-soft:#A78BFA; --sky:#38BDF8;'
				+ ' --bar-gradient: linear-gradient(90deg, var(--purple), var(--purple-soft), var(--sky)); }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.barStops.join(','), '7C3AED,A78BFA,38BDF8', 'barStops from gradient var() refs')
			// No --bar-gradient -> fallback
			const t2 = extractThemeFromCSS(':root { --bg:#000000; }')
			assertEqual(t2.barStops.join(','), [t2.accent, t2.accentSoft, t2.sky].join(','), 'barStops fallback')
		},
	},
	{
		name: 'extractTheme v2: forcePreset bypasses CSS; unknown name falls back (no throw)',
		fn: async () => {
			const theme = extractThemeFromCSS(':root { --bg:#000000; --purple:#FF0000; }', { forcePreset: 'light' })
			assertEqual(theme.bg, 'FFFFFF', 'bg from forced light preset (CSS ignored)')
			assertEqual(theme.accent, '7C3AED', 'accent from forced light preset (CSS ignored)')
			assertEqual(theme.presetName, 'light', 'presetName === forced preset')
			// Unknown forcePreset must NOT throw — falls back to defaultPreset
			const t2 = extractThemeFromCSS('', { forcePreset: 'nope', defaultPreset: 'light' })
			assertEqual(t2.bg, 'FFFFFF', 'unknown forcePreset falls back to defaultPreset')
		},
	},
	{
		name: 'extractTheme v2: extended palette slots (bgMid/bgDeep/coral/gray300)',
		fn: async () => {
			const css = ':root { --bg-mid:#111111; --bg-deep:#222222; --coral:#FB7185; --gray-300:#A0A0B0; }'
			const theme = extractThemeFromCSS(css)
			assertEqual(theme.bgMid, '111111', 'bgMid via --bg-mid')
			assertEqual(theme.bgDeep, '222222', 'bgDeep via --bg-deep (re-pointed from bg)')
			assertEqual(theme.coral, 'FB7185', 'coral via --coral')
			assertEqual(theme.gray300, 'A0A0B0', 'gray300 via --gray-300')
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
]
