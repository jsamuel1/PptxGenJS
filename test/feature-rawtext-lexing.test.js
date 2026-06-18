'use strict'

// Feature: raw-text lexing for <script> and <style> elements.

const { assert } = require('./helpers')
const { parseHtml, textOf } = require('../src/bld/utils.cjs.js')

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
	{
		name: 'rawtext: textarea content is one #text child, < not mis-tokenized (SAU-44)',
		fn: async () => {
			const root = parseHtml('<textarea><div>x<y</textarea>')
			const ta = root.children[0]
			assert(ta.tag === 'textarea', 'expected textarea element')
			assert(ta.children.length === 1, 'textarea should have a single #text child; got ' + ta.children.length)
			assert(ta.children[0].tag === '#text', 'textarea child should be #text')
			assert(ta.children[0].text === '<div>x<y', 'textarea raw text mismatch; got: ' + ta.children[0].text)
		},
	},
	{
		name: 'rawtext: title keeps < as text, RCDATA entity-decoded (SAU-44)',
		fn: async () => {
			const root = parseHtml('<title>a<b</title>')
			const title = root.children[0]
			assert(title.tag === 'title', 'expected title element')
			assert(title.children.length === 1, 'title should have a single #text child')
			assert(title.children[0].text === 'a<b', 'title text mismatch; got: ' + title.children[0].text)
			// RCDATA tags ARE entity-decoded (unlike verbatim script/style)
			assert(parseHtml('<title>Tom &amp; Jerry</title>').children[0].children[0].text === 'Tom & Jerry',
				'title content must be entity-decoded')
		},
	},
	{
		name: 'rawtext: script/style stay verbatim (NOT entity-decoded)',
		fn: async () => {
			const sc = parseHtml('<script>if(a &amp;&amp; b){}</script>').children[0]
			assert(sc.children[0].text === 'if(a &amp;&amp; b){}', 'script must stay verbatim; got: ' + sc.children[0].text)
		},
	},
	{
		name: 'rawtext: textarea raw lexing does not corrupt sibling extraction',
		fn: async () => {
			// Before the fix, "<y" was mis-tokenized as a start tag, swallowing the following <p>.
			// Now textarea scans to its literal close tag, so the sibling <p> survives intact.
			const root = parseHtml('<div><textarea>x<y</textarea><p>Shown</p></div>')
			assert(textOf(root).indexOf('Shown') !== -1, 'sibling text must survive textarea raw lexing')
		},
	},
]
