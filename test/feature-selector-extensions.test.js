'use strict'

// Feature: selector extensions — attribute ^=/$= operators and +/~ sibling combinators.

const { assert } = require('./helpers')
const {
	parseHtml, query, matches,
} = require('../src/bld/utils.cjs.js')

const HTML_ATTR = `
<div>
  <a class="link-primary" href="https://example.com/page">primary</a>
  <a class="link-secondary" href="/local">secondary</a>
  <a class="other" href="https://example.com/doc.pdf">pdf</a>
</div>`

const HTML_SIBLINGS = `
<div class="container">
  <h1>Title</h1>
  <p class="intro-text">First paragraph</p>
  <p class="body-text">Second paragraph</p>
  <p class="outro-text">Third paragraph</p>
</div>`

module.exports = [
	{
		name: '[attr^="val"]: matches elements where attr starts with value',
		fn: async () => {
			const root = parseHtml(HTML_ATTR)
			const results = query(root, '[href^="https"]')
			assert(results.length === 2, `expected 2, got ${results.length}`)
		},
	},
	{
		name: '[attr^="val"]: does NOT match elements where attr does not start with value',
		fn: async () => {
			const root = parseHtml(HTML_ATTR)
			const results = query(root, '[href^="/local"]')
			assert(results.length === 1, `expected 1, got ${results.length}`)
			assert(!matches(results[0], '[href^="https"]'), 'should not match ^= https')
		},
	},
	{
		name: '[attr$="val"]: matches elements where attr ends with value',
		fn: async () => {
			const root = parseHtml(HTML_ATTR)
			const results = query(root, '[href$=".pdf"]')
			assert(results.length === 1, `expected 1, got ${results.length}`)
		},
	},
	{
		name: '[attr$="val"]: does NOT match elements where attr does not end with value',
		fn: async () => {
			const root = parseHtml(HTML_ATTR)
			const a = query(root, '[href^="/local"]')[0]
			assert(!matches(a, '[href$=".pdf"]'), 'should not match $= .pdf')
		},
	},
	{
		name: 'h1 + p: matches <p> immediately after <h1> (adjacent sibling)',
		fn: async () => {
			const root = parseHtml(HTML_SIBLINGS)
			const results = query(root, 'h1 + p')
			assert(results.length === 1, `expected 1, got ${results.length}`)
			assert(results[0].attrs.class === 'intro-text', 'should be the first <p> after h1')
		},
	},
	{
		name: 'h1 + p: does NOT match <p> that is not immediately after <h1>',
		fn: async () => {
			const root = parseHtml(HTML_SIBLINGS)
			const body = query(root, '.body-text')[0]
			assert(!matches(body, 'h1 + p'), 'body-text is not adjacent to h1')
		},
	},
	{
		name: 'h1 ~ p: matches any <p> sibling after <h1> (general sibling)',
		fn: async () => {
			const root = parseHtml(HTML_SIBLINGS)
			const results = query(root, 'h1 ~ p')
			assert(results.length === 3, `expected 3, got ${results.length}`)
		},
	},
	{
		name: 'h1 ~ p: does NOT match <p> before <h1>',
		fn: async () => {
			const html = '<div><p>before</p><h1>Title</h1><p>after</p></div>'
			const root = parseHtml(html)
			const results = query(root, 'h1 ~ p')
			assert(results.length === 1, `expected 1 (only after), got ${results.length}`)
		},
	},
	{
		name: 'combined: div.container > h1 + p[class^="intro"]',
		fn: async () => {
			const root = parseHtml(HTML_SIBLINGS)
			const results = query(root, 'div.container > h1 + p[class^="intro"]')
			assert(results.length === 1, `expected 1, got ${results.length}`)
			assert(results[0].attrs.class === 'intro-text', 'should match intro-text')
		},
	},
]
