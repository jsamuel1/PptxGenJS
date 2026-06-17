'use strict'
const { parseHtml, query, queryOne, matches } = require('../src/bld/utils.cjs.js')
const { assert } = require('./helpers.js')

const html = `<ul>
  <li class="a">one</li>
  <li class="b">two</li>
  <li class="c">three</li>
  <li class="d">four</li>
</ul>`

module.exports = [
	{
		name: ':first-child matches only the first element child',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:first-child')
			assert(hits.length === 1, 'expected 1, got ' + hits.length)
			assert(hits[0].classes.includes('a'), 'expected class "a"')
		}
	},
	{
		name: ':last-child matches only the last element child',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:last-child')
			assert(hits.length === 1, 'expected 1, got ' + hits.length)
			assert(hits[0].classes.includes('d'), 'expected class "d"')
		}
	},
	{
		name: ':nth-child(2) matches the second element child',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:nth-child(2)')
			assert(hits.length === 1, 'expected 1, got ' + hits.length)
			assert(hits[0].classes.includes('b'), 'expected class "b"')
		}
	},
	{
		name: ':nth-child(4) matches the fourth element child',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:nth-child(4)')
			assert(hits.length === 1, 'expected 1, got ' + hits.length)
			assert(hits[0].classes.includes('d'), 'expected class "d"')
		}
	},
	{
		name: ':not(.b) excludes elements matching the inner selector',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:not(.b)')
			assert(hits.length === 3, 'expected 3, got ' + hits.length)
			assert(!hits.some(h => h.classes.includes('b')), 'none should have class "b"')
		}
	},
	{
		name: ':not(:first-child) excludes the first child',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:not(:first-child)')
			assert(hits.length === 3, 'expected 3, got ' + hits.length)
			assert(!hits.some(h => h.classes.includes('a')), 'none should have class "a"')
		}
	},
	{
		name: 'combined pseudo-classes work (li:first-child:not(.z))',
		fn () {
			const root = parseHtml(html)
			const hits = query(root, 'li:first-child:not(.z)')
			assert(hits.length === 1, 'expected 1, got ' + hits.length)
			assert(hits[0].classes.includes('a'), 'expected class "a"')
		}
	},
	{
		name: '::before still throws unsupported',
		fn () {
			const root = parseHtml(html)
			let threw = false
			try { query(root, 'p::before') } catch (e) { threw = /unsupported/i.test(e.message) }
			assert(threw, 'expected unsupported-selector throw for ::before')
		}
	},
	{
		name: ':hover throws unsupported (not a structural pseudo)',
		fn () {
			const root = parseHtml(html)
			let threw = false
			try { query(root, 'a:hover') } catch (e) { threw = /unsupported/i.test(e.message) }
			assert(threw, 'expected unsupported-selector throw for :hover')
		}
	}
]
