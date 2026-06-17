const { assertEqual } = require('./helpers')
const { hslToHex, hwbToHex, parseHslString, parseHwbString, extractVarFallback } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'hslToHex: red (0, 100%, 50%)',
		fn: () => assertEqual(hslToHex(0, 100, 50), 'FF0000'),
	},
	{
		name: 'hslToHex: green (120, 100%, 25%)',
		fn: () => assertEqual(hslToHex(120, 100, 25), '008000'),
	},
	{
		name: 'hslToHex: blue (240, 100%, 50%)',
		fn: () => assertEqual(hslToHex(240, 100, 50), '0000FF'),
	},
	{
		name: 'hslToHex: grey (0, 0%, 50%)',
		fn: () => assertEqual(hslToHex(0, 0, 50), '808080'),
	},
	{
		name: 'parseHslString: comma-separated',
		fn: () => assertEqual(parseHslString('hsl(0, 100%, 50%)'), 'FF0000'),
	},
	{
		name: 'parseHslString: space-separated',
		fn: () => assertEqual(parseHslString('hsl(240 100% 50%)'), '0000FF'),
	},
	{
		name: 'parseHslString: hsla with alpha (alpha ignored)',
		fn: () => assertEqual(parseHslString('hsla(120, 100%, 25%, 0.5)'), '008000'),
	},
	{
		name: 'parseHslString: invalid returns null',
		fn: () => assertEqual(parseHslString('not-a-color'), null),
	},
	{
		name: 'hwbToHex: pure red (0, 0%, 0%)',
		fn: () => assertEqual(hwbToHex(0, 0, 0), 'FF0000'),
	},
	{
		name: 'hwbToHex: white (0, 100%, 0%)',
		fn: () => assertEqual(hwbToHex(0, 100, 0), 'FFFFFF'),
	},
	{
		name: 'hwbToHex: black (0, 0%, 100%)',
		fn: () => assertEqual(hwbToHex(0, 0, 100), '000000'),
	},
	{
		name: 'hwbToHex: grey (0, 50%, 50%)',
		fn: () => assertEqual(hwbToHex(0, 50, 50), '808080'),
	},
	{
		name: 'parseHwbString: valid',
		fn: () => assertEqual(parseHwbString('hwb(0 100% 0%)'), 'FFFFFF'),
	},
	{
		name: 'parseHwbString: invalid returns null',
		fn: () => assertEqual(parseHwbString('rgb(255,0,0)'), null),
	},
	{
		name: 'extractVarFallback: simple fallback',
		fn: () => assertEqual(extractVarFallback('var(--primary, red)'), 'red'),
	},
	{
		name: 'extractVarFallback: no fallback returns null',
		fn: () => assertEqual(extractVarFallback('var(--primary)'), null),
	},
	{
		name: 'extractVarFallback: nested var in fallback',
		fn: () => assertEqual(extractVarFallback('var(--x, var(--y, blue))'), 'var(--y, blue)'),
	},
]
