'use strict'

// Feature: PUA-range filtering in textOf (docs/feature-pua-text-filtering.md).

const { assert } = require('./helpers')
const { parseHtml, textOf } = require('../src/bld/utils.cjs.js')

/** Helper: parse HTML and return textOf the root's first child element. */
function text (html, opts) {
	const doc = parseHtml(html)
	return textOf(doc.children[0], opts)
}

module.exports = [
	{
		name: 'textOf PUA: strips BMP PUA codepoints',
		fn: async () => {
			assert(text('<div>\uE007hello</div>') === 'hello', 'expected "hello"')
		},
	},
	{
		name: 'textOf PUA: strips supplementary PUA plane 15',
		fn: async () => {
			assert(text('<div>\uDB80\uDC00world</div>') === 'world', 'expected "world"')
		},
	},
	{
		name: 'textOf PUA: strips supplementary PUA plane 16',
		fn: async () => {
			assert(text('<div>\uDBC0\uDC00test</div>') === 'test', 'expected "test"')
		},
	},
	{
		name: 'textOf PUA: keepPUA preserves PUA codepoints',
		fn: async () => {
			const result = text('<div>\uE007hello</div>', { keepPUA: true })
			assert(result === '\uE007hello', 'expected PUA char preserved')
		},
	},
	{
		name: 'textOf PUA: collapses whitespace left by stripped PUA',
		fn: async () => {
			assert(text('<div>A \uE007 B</div>') === 'A B', 'expected "A B"')
		},
	},
	{
		name: 'textOf PUA: PUA-free text unchanged (no-op fast path)',
		fn: async () => {
			assert(text('<div>Hello World</div>') === 'Hello World', 'expected "Hello World"')
		},
	},
	{
		name: 'textOf PUA: mixed content icon element with PUA + adjacent text',
		fn: async () => {
			assert(text('<div><i class="fa-music">\uE007</i>7\u00D7</div>') === '7\u00D7', 'expected "7\u00D7"')
		},
	},
	{
		name: 'textOf PUA: adjacent chars not corrupted by surrogate-pair removal',
		fn: async () => {
			assert(text('<div>X\uDB80\uDC00Y</div>') === 'XY', 'expected "XY"')
		},
	},
]
