'use strict'

// Feature: innerTextOf — browser-like innerText extraction with block boundaries.

const { assert } = require('./helpers')
const { parseHtml, innerTextOf } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'innerTextOf: inline concatenation — no space between inline elements',
		fn: async () => {
			const tree = parseHtml('<span>a</span><span>b</span>')
			assert(innerTextOf(tree) === 'ab', 'expected "ab", got "' + innerTextOf(tree) + '"')
		},
	},
	{
		name: 'innerTextOf: block separation — block elements produce newlines',
		fn: async () => {
			const tree = parseHtml('<p>hello</p><p>world</p>')
			assert(innerTextOf(tree) === 'hello\nworld', 'expected "hello\\nworld", got "' + innerTextOf(tree) + '"')
		},
	},
	{
		name: 'innerTextOf: nested blocks — deduplicated newlines',
		fn: async () => {
			const tree = parseHtml('<div><p>a</p><p>b</p></div>')
			assert(innerTextOf(tree) === 'a\nb', 'expected "a\\nb", got "' + innerTextOf(tree) + '"')
		},
	},
	{
		name: 'innerTextOf: <br> inserts newline',
		fn: async () => {
			const tree = parseHtml('a<br>b')
			assert(innerTextOf(tree) === 'a\nb', 'expected "a\\nb", got "' + innerTextOf(tree) + '"')
		},
	},
	{
		name: 'innerTextOf: invisible tags skipped',
		fn: async () => {
			const tree = parseHtml('<div>x<script>y</script>z</div>')
			assert(innerTextOf(tree) === 'xz', 'expected "xz", got "' + innerTextOf(tree) + '"')
		},
	},
	{
		name: 'innerTextOf: whitespace collapsing',
		fn: async () => {
			const tree = parseHtml('<p>  hello   world  </p>')
			assert(innerTextOf(tree) === 'hello world', 'expected "hello world", got "' + innerTextOf(tree) + '"')
		},
	},
	{
		name: 'innerTextOf: list items produce newlines',
		fn: async () => {
			const tree = parseHtml('<ul><li>one</li><li>two</li></ul>')
			assert(innerTextOf(tree) === 'one\ntwo', 'expected "one\\ntwo", got "' + innerTextOf(tree) + '"')
		},
	},
]
