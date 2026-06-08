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
]
