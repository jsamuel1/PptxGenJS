'use strict'

// Feature: raw-text lexing for <script> and <style> elements.

const { assert } = require('./helpers')
const { parseHtml } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'rawtext: script with < in content',
		fn: async () => {
			const root = parseHtml('<script>if(a<b){}</script>')
			const script = root.children[0]
			assert(script.tag === 'script', 'expected script element')
			assert(script.children.length === 1, 'expected one text child')
			assert(script.children[0].text === 'if(a<b){}', 'script text mismatch')
		},
	},
	{
		name: 'rawtext: style with < in content',
		fn: async () => {
			const root = parseHtml('<style>.a{content:\'<b>\'}</style>')
			const style = root.children[0]
			assert(style.tag === 'style', 'expected style element')
			assert(style.children.length === 1, 'expected one text child')
			assert(style.children[0].text === '.a{content:\'<b>\'}', 'style text mismatch')
		},
	},
	{
		name: 'rawtext: script does not consume sibling elements',
		fn: async () => {
			const root = parseHtml('<div><script>x<y</script><p>ok</p></div>')
			const div = root.children[0]
			assert(div.children.length === 2, 'div should have 2 children, got ' + div.children.length)
			assert(div.children[0].tag === 'script', 'first child should be script')
			assert(div.children[1].tag === 'p', 'second child should be p')
		},
	},
	{
		name: 'rawtext: empty script has no children',
		fn: async () => {
			const root = parseHtml('<script></script>')
			const script = root.children[0]
			assert(script.tag === 'script', 'expected script element')
			assert(script.children.length === 0, 'empty script should have no children')
		},
	},
]
