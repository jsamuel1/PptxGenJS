'use strict'

// Feature: textOf skips invisible elements (script/style/noscript) — task-8.

const { assert } = require('./helpers')
const { parseHtml, textOf } = require('../src/bld/utils.cjs.js')

/** Helper: parse HTML and return textOf the root. */
function text (html) {
	return textOf(parseHtml(html))
}

module.exports = [
	{
		name: 'textOf: skips <script> content',
		fn: async () => {
			assert(text('<div>hello<script>var x=1;</script> world</div>') === 'hello world',
				'script content must not leak')
		},
	},
	{
		name: 'textOf: skips <style> content',
		fn: async () => {
			assert(text('<p>text<style>.x{color:red}</style>more</p>') === 'textmore',
				'style content must not leak')
		},
	},
	{
		name: 'textOf: skips <noscript> content',
		fn: async () => {
			assert(text('<div><noscript>fallback</noscript><span>visible</span></div>') === 'visible',
				'noscript content must not leak')
		},
	},
	{
		name: 'textOf: skips <template> content (SAU-43)',
		fn: async () => {
			assert(text('<div><template><p>hidden tmpl text</p></template><p>Shown</p></div>') === 'Shown',
				'template content must not leak')
		},
	},
	{
		name: 'textOf: still skips <svg> (regression)',
		fn: async () => {
			assert(text('<div>a<svg><text>b</text></svg>c</div>') === 'ac',
				'svg content must not leak')
		},
	},
]
