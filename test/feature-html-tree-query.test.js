'use strict'

// Feature: parseHtml() + a bounded selector engine (docs/feature-html-tree-query.md).
// Promotes the private, dependency-free HTML tree-builder behind parseCards()/parseSvg() into a
// shared, exported surface and layers a BOUNDED CSS-selector engine on top. Parsing is tolerant
// (never throws on bad HTML); querying is strict (any selector outside the documented grammar
// throws `unsupported selector: …`, so a consumer can never silently get a wrong answer).

const { assert } = require('./helpers')
const {
	parseHtml, query, queryOne, closest, matches, textOf, attr, clone, outerHtml,
} = require('../src/bld/utils.cjs.js')

const HTML =
	'<section class="slide" id="main" data-demo>' +
	'<ul><li>a</li><li>b</li></ul>' +
	'<span class="brand-name">Acme</span>' +
	'<div class="timeline"><div>1</div><div>2</div></div>' +
	'</section>'

module.exports = [
	{
		name: 'parseHtml: builds a tolerant tree (unclosed/malformed HTML never throws)',
		fn: async () => {
			const root = parseHtml('<div><span>oops')
			assert(root.children.length >= 1, 'expected at least one child node')
			assert(root.children[0].tag === 'div', 'expected first child to be <div>; got: ' + root.children[0].tag)
			// empty / non-string input is tolerated too
			assert(parseHtml('').children.length === 0, 'empty string → empty root')
		},
	},
	{
		name: 'query: type + class compound selector',
		fn: async () => {
			const root = parseHtml(HTML)
			assert(query(root, 'section.slide').length === 1, 'expected exactly one section.slide')
		},
	},
	{
		name: 'query: descendant combinator (ul li)',
		fn: async () => {
			const root = parseHtml(HTML)
			assert(query(root, 'ul li').length === 2, 'expected two ul li')
		},
	},
	{
		name: 'query: child combinator (.timeline > *)',
		fn: async () => {
			const root = parseHtml(HTML)
			assert(query(root, '.timeline > *').length === 2, 'expected two direct children of .timeline')
			// universal alone matches every element
			assert(query(root, '*').length === elementCount(root), 'universal should match every element')
		},
	},
	{
		name: 'query: selector list (h1,h2,h3 → none here)',
		fn: async () => {
			const root = parseHtml(HTML)
			assert(query(root, 'h1,h2,h3').length === 0, 'expected no headings')
		},
	},
	{
		name: 'query: attribute-substring + attribute-present',
		fn: async () => {
			const root = parseHtml(HTML)
			assert(query(root, '[class*="time"]').length >= 1, 'expected >=1 [class*="time"]')
			assert(query(root, '[data-demo]').length === 1, 'expected one [data-demo] element')
			assert(query(root, '[class*="x-not-present"]').length === 0, 'substring miss → none')
		},
	},
	{
		name: 'queryOne + textOf + attr on a compound attribute selector',
		fn: async () => {
			const root = parseHtml(HTML)
			const brand = queryOne(root, 'span[class*="brand"]')
			assert(brand !== null, 'expected a matching span')
			assert(textOf(brand) === 'Acme', 'expected textOf === Acme; got: ' + textOf(brand))
			assert(attr(brand, 'class') === 'brand-name', 'attr(class) should be brand-name')
			assert(attr(brand, 'missing') === undefined, 'absent attr → undefined')
			assert(queryOne(root, '.no-such-thing') === null, 'no match → null')
		},
	},
	{
		name: 'id selector (#main)',
		fn: async () => {
			const root = parseHtml(HTML)
			assert(query(root, '#main').length === 1, 'expected one #main')
			assert(query(root, 'section#main.slide').length === 1, 'compound type+id+class')
		},
	},
	{
		name: 'closest + matches',
		fn: async () => {
			const root = parseHtml(HTML)
			const li = query(root, 'li')[0]
			assert(closest(li, '.slide') !== null, 'li should have a .slide ancestor')
			assert(closest(li, '.slide').tag === 'section', 'closest(.slide) should be the section')
			assert(closest(li, 'li') === li, 'closest matches self')
			assert(closest(li, '.nope') === null, 'no ancestor match → null')
			assert(matches(query(root, '.timeline')[0], '[class*="time"]') === true, 'timeline matches [class*=time]')
			assert(matches(li, 'section') === false, 'li does not match section')
		},
	},
	{
		name: 'clone: deep copy is detached and independent',
		fn: async () => {
			const root = parseHtml(HTML)
			const section = queryOne(root, 'section.slide')
			const copy = clone(section)
			assert(copy.parent === null, 'clone is detached')
			assert(copy !== section, 'clone is a new object')
			assert(textOf(copy) === textOf(section), 'clone preserves text')
			copy.children.length = 0
			assert(section.children.length > 0, 'mutating clone does not affect original')
		},
	},
	{
		name: 'outerHtml: round-trips structure (and uses raw for <svg>)',
		fn: async () => {
			const root = parseHtml('<div class="x"><span>hi</span></div>')
			const div = queryOne(root, 'div.x')
			assert(outerHtml(div) === '<div class="x"><span>hi</span></div>', 'outerHtml round-trip; got: ' + outerHtml(div))
			const svgRoot = parseHtml('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')
			const svg = queryOne(svgRoot, 'svg')
			assert(outerHtml(svg).indexOf('<svg') === 0, 'svg outerHtml uses raw markup')
			assert(outerHtml(svg).indexOf('<path') !== -1, 'svg raw markup preserved')
		},
	},
	{
		name: 'bounded grammar: unsupported selectors throw a clear error (regression guard)',
		fn: async () => {
			const root = parseHtml(HTML)
			// Each of these is outside the documented grammar and MUST throw rather than
			// silently returning a wrong result. This is the GAP regression-catch: if the
			// guard regressed (e.g. a pseudo-class were silently ignored), these would not throw.
			const bad = [
				'li:nth-child(2)',   // pseudo-class
				'p::before',         // pseudo-element
				'a + b',             // adjacent-sibling combinator
				'a ~ b',             // general-sibling combinator
				'[href^="http"]',    // prefix attr operator
				'[href$=".png"]',    // suffix attr operator
				'[lang|="en"]',      // dash-match attr operator
				'[class~="x"]',      // include attr operator
			]
			for (const sel of bad) {
				let threw = false
				try { query(root, sel) } catch (e) { threw = /unsupported|selector/i.test(e.message) }
				assert(threw, 'expected unsupported-selector throw for: ' + sel)
			}
			// matches() and closest() enforce the same grammar
			let mThrew = false
			try { matches(query(root, 'li')[0], 'li:hover') } catch (e) { mThrew = /unsupported|selector/i.test(e.message) }
			assert(mThrew, 'matches() should also reject unsupported selectors')
		},
	},
]

/** Count every element (non-text, non-root) node — for the universal-selector assertion. */
function elementCount(node) {
	let n = 0
	for (const c of node.children) {
		if (c.tag === '#text') continue
		n += 1 + elementCount(c)
	}
	return n
}
