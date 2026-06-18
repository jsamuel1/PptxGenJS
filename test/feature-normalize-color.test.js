const { assertEqual } = require('./helpers')
const { normalizeColor, extractThemeFromCSS } = require('../src/bld/utils.cjs.js')

module.exports = [
	// --- SAU-46: lab() parsing + var() fallback honored through the REAL extractor pipeline ---
	{
		name: 'normalizeColor: lab() white/black/red parse to valid hex',
		fn: () => {
			assertEqual(normalizeColor('lab(100 0 0)'), 'FFFFFF', 'lab white')
			assertEqual(normalizeColor('lab(0 0 0)'), '000000', 'lab black')
			const r = normalizeColor('lab(54% 80 70)')
			if (!/^[0-9A-F]{6}$/.test(r)) throw new Error('expected 6-digit hex from lab(), got ' + r)
		},
	},
	{
		name: 'normalizeColor: lab() with alpha keeps 8-digit hex',
		fn: () => {
			const r = normalizeColor('lab(50 40 -30 / 0.5)')
			if (!/^[0-9A-F]{6}80$/.test(r)) throw new Error('expected 8-digit hex w/ 80 alpha from lab(), got ' + r)
		},
	},
	{
		name: 'SAU-46 pipeline: extractThemeFromCSS honors var(--undefined, #fallback)',
		fn: () => {
			// resolveVar previously discarded the fallback → accent collapsed to '' (failed hex validation).
			assertEqual(extractThemeFromCSS(':root{--accent:var(--brand-accent,#FF9900)}').accent, 'FF9900', 'var() fallback honored')
		},
	},
	{
		name: 'SAU-46 pipeline: lab() is not stored verbatim into an accent slot',
		fn: () => {
			const t = extractThemeFromCSS(':root{--accent:lab(54% 80 70)}')
			if (!/^[0-9A-F]{6}$/.test(t.accent)) throw new Error('accent must be 6-hex, not verbatim lab(); got ' + t.accent)
			assertEqual(t.slotSource.accent, 'extracted', 'lab() slot still marked extracted (it parsed)')
		},
	},
	{
		name: 'SAU-46 pipeline: an UNPARSEABLE colour function is left for the preset, not stored verbatim',
		fn: () => {
			// A modern function with no parser must NOT pollute the slot — preset repairs it.
			const t = extractThemeFromCSS(':root{--accent:color(display-p3 1 0.5 0)}')
			if (!/^[0-9A-Fa-f]{6}$/.test(t.accent)) throw new Error('accent must be valid 6-hex (preset), got ' + t.accent)
			assertEqual(t.slotSource.accent, 'preset', 'unparseable value falls back to preset')
		},
	},

	{
		name: 'normalizeColor: 3-digit hex',
		fn: () => assertEqual(normalizeColor('#abc'), 'AABBCC'),
	},
	{
		name: 'normalizeColor: 6-digit hex',
		fn: () => assertEqual(normalizeColor('#ff0000'), 'FF0000'),
	},
	{
		name: 'normalizeColor: 8-digit hex opaque',
		fn: () => assertEqual(normalizeColor('#ff0000ff'), 'FF0000'),
	},
	{
		name: 'normalizeColor: 8-digit hex with alpha',
		fn: () => assertEqual(normalizeColor('#ff000080'), 'FF000080'),
	},
	{
		name: 'normalizeColor: 4-digit hex with alpha',
		fn: () => assertEqual(normalizeColor('#f008'), 'FF000088'),
	},
	{
		name: 'normalizeColor: rgb()',
		fn: () => assertEqual(normalizeColor('rgb(255, 0, 0)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: rgba() with alpha',
		fn: () => assertEqual(normalizeColor('rgba(255, 0, 0, 0.5)'), 'FF000080'),
	},
	{
		name: 'normalizeColor: named colour',
		fn: () => assertEqual(normalizeColor('red'), 'FF0000'),
	},
	{
		name: 'normalizeColor: hsl()',
		fn: () => assertEqual(normalizeColor('hsl(0, 100%, 50%)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: hwb()',
		fn: () => assertEqual(normalizeColor('hwb(0 0% 0%)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: oklch white',
		fn: () => assertEqual(normalizeColor('oklch(100% 0 0)'), 'FFFFFF'),
	},
	{
		name: 'normalizeColor: oklch black',
		fn: () => assertEqual(normalizeColor('oklch(0% 0 0)'), '000000'),
	},
	{
		name: 'normalizeColor: oklch returns valid hex',
		fn: () => {
			const result = normalizeColor('oklch(62.8% 0.2577 29.23)')
			if (!/^[0-9A-F]{6}$/.test(result)) throw new Error('expected 6-digit hex, got ' + result)
		},
	},
	{
		name: 'normalizeColor: var() fallback',
		fn: () => assertEqual(normalizeColor('var(--x, #ff0000)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: passthrough unknown',
		fn: () => assertEqual(normalizeColor('transparent'), 'transparent'),
	},
]
