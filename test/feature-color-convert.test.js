const { assertEqual } = require('./helpers')
// SAU-68 item 3: the per-format colour helpers (hslToHex/hwbToHex/parseHslString/
// parseHwbString/extractVarFallback) are no longer part of the public `/utils` barrel —
// they are internal to normalizeColor. Assert the same conversions through normalizeColor,
// the single public colour entry point.
const { normalizeColor } = require('../src/bld/utils.cjs.js')

module.exports = [
	// hsl() conversion (internally: parseHslString → hslToHex)
	{
		name: 'normalizeColor: hsl red (0, 100%, 50%)',
		fn: () => assertEqual(normalizeColor('hsl(0, 100%, 50%)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: hsl green (120, 100%, 25%)',
		fn: () => assertEqual(normalizeColor('hsl(120, 100%, 25%)'), '008000'),
	},
	{
		name: 'normalizeColor: hsl blue (240, 100%, 50%)',
		fn: () => assertEqual(normalizeColor('hsl(240, 100%, 50%)'), '0000FF'),
	},
	{
		name: 'normalizeColor: hsl grey (0, 0%, 50%)',
		fn: () => assertEqual(normalizeColor('hsl(0, 0%, 50%)'), '808080'),
	},
	{
		name: 'normalizeColor: hsl space-separated',
		fn: () => assertEqual(normalizeColor('hsl(240 100% 50%)'), '0000FF'),
	},
	{
		name: 'normalizeColor: hsla alpha ignored when fully opaque',
		fn: () => assertEqual(normalizeColor('hsla(120, 100%, 25%, 1)'), '008000'),
	},
	// hwb() conversion (internally: parseHwbString → hwbToHex)
	{
		name: 'normalizeColor: hwb pure red (0 0% 0%)',
		fn: () => assertEqual(normalizeColor('hwb(0 0% 0%)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: hwb white (0 100% 0%)',
		fn: () => assertEqual(normalizeColor('hwb(0 100% 0%)'), 'FFFFFF'),
	},
	{
		name: 'normalizeColor: hwb black (0 0% 100%)',
		fn: () => assertEqual(normalizeColor('hwb(0 0% 100%)'), '000000'),
	},
	{
		name: 'normalizeColor: hwb grey (0 50% 50%)',
		fn: () => assertEqual(normalizeColor('hwb(0 50% 50%)'), '808080'),
	},
	// var() fallback (internally: extractVarFallback → recurse)
	{
		name: 'normalizeColor: var() simple fallback resolved',
		fn: () => assertEqual(normalizeColor('var(--primary, red)'), 'FF0000'),
	},
	{
		name: 'normalizeColor: var() nested fallback resolved',
		fn: () => assertEqual(normalizeColor('var(--x, var(--y, blue))'), '0000FF'),
	},
]
