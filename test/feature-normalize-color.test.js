const { assertEqual } = require('./helpers')
const { normalizeColor } = require('../src/bld/utils.cjs.js')

module.exports = [
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
