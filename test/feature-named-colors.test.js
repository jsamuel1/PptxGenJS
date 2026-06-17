const { assertEqual } = require('./helpers')
const { cssNamedColorToHex } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'cssNamedColorToHex: basic lookup — navy',
		fn: () => assertEqual(cssNamedColorToHex('navy'), '000080'),
	},
	{
		name: 'cssNamedColorToHex: basic lookup — white',
		fn: () => assertEqual(cssNamedColorToHex('white'), 'FFFFFF'),
	},
	{
		name: 'cssNamedColorToHex: basic lookup — rebeccapurple',
		fn: () => assertEqual(cssNamedColorToHex('rebeccapurple'), '663399'),
	},
	{
		name: 'cssNamedColorToHex: case-insensitive',
		fn: () => assertEqual(cssNamedColorToHex('DarkSlateGray'), '2F4F4F'),
	},
	{
		name: 'cssNamedColorToHex: trims whitespace',
		fn: () => assertEqual(cssNamedColorToHex('  red  '), 'FF0000'),
	},
	{
		name: 'cssNamedColorToHex: unknown name returns null',
		fn: () => assertEqual(cssNamedColorToHex('notacolor'), null),
	},
	{
		name: 'cssNamedColorToHex: empty string returns null',
		fn: () => assertEqual(cssNamedColorToHex(''), null),
	},
]
