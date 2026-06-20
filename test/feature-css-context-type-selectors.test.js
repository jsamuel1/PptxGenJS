'use strict'

// Feature: css-context type-selector support (TypeRule parsing and cascade resolution)
// Tests type selectors (h1, td, h1.title) parsed by parseStyleSheets and resolved via cssProp.

const { assert, assertEqual } = require('./helpers')
const { parseStyleSheets, cssProp, typeDecls, EMPTY_CSS } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'parseStyleSheets captures a bare type selector',
		fn: async () => {
			const ctx = parseStyleSheets('<style>h1 { color: #FF0000 }</style>')
			assertEqual(ctx.typeRules.length, 1, 'should have 1 type rule')
			assertEqual(ctx.typeRules[0].tag, 'h1')
			assertEqual(ctx.typeRules[0].classes.length, 0)
			assertEqual(ctx.typeRules[0].decls.color, '#FF0000')
		},
	},
	{
		name: 'cssProp resolves type-selector colour for matching element',
		fn: async () => {
			const ctx = parseStyleSheets('<style>h1 { color: #FF0000 }</style>')
			const el = { tag: 'h1', classes: [], style: {}, attrs: {}, children: [] }
			assertEqual(cssProp(el, 'color', ctx), '#FF0000')
		},
	},
	{
		name: 'class rule takes precedence over type rule',
		fn: async () => {
			const ctx = parseStyleSheets('<style>h1 { color: red } .title { color: blue }</style>')
			const el = { tag: 'h1', classes: ['title'], style: {}, attrs: {}, children: [] }
			assertEqual(cssProp(el, 'color', ctx), 'blue')
		},
	},
	{
		name: 'compound type+class selector matches tag with class but not bare tag',
		fn: async () => {
			const ctx = parseStyleSheets('<style>h1.title { font-size: 24px }</style>')
			const withClass = { tag: 'h1', classes: ['title'], style: {}, attrs: {}, children: [] }
			const bare = { tag: 'h1', classes: [], style: {}, attrs: {}, children: [] }
			assertEqual(cssProp(withClass, 'font-size', ctx), '24px')
			assertEqual(cssProp(bare, 'font-size', ctx), undefined)
		},
	},
	{
		name: 'inline style takes precedence over type rule',
		fn: async () => {
			const ctx = parseStyleSheets('<style>h1 { color: red }</style>')
			const el = { tag: 'h1', classes: [], style: { color: 'green' }, attrs: {}, children: [] }
			assertEqual(cssProp(el, 'color', ctx), 'green')
		},
	},
	{
		name: 'type rules are empty when no type selectors present',
		fn: async () => {
			const ctx = parseStyleSheets('<style>.foo { color: red }</style>')
			assertEqual(ctx.typeRules.length, 0)
			assertEqual(EMPTY_CSS.typeRules.length, 0)
		},
	},
]
