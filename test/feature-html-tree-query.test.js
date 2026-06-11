'use strict'

// Feature: parseHtml() + a bounded selector engine (docs/feature-html-tree-query.md).
// Promotes the private, dependency-free HTML tree-builder behind parseCards()/parseSvg() into a
// shared, exported surface and layers a BOUNDED CSS-selector engine on top. Parsing is tolerant
// (never throws on bad HTML); querying is strict (any selector outside the documented grammar
// throws `unsupported selector: …`, so a consumer can never silently get a wrong answer).

const { assert } = require('./helpers')
const {
	parseHtml, query, queryOne, closest, matches, isAncestorOrSelf, textOf, attr, clone, outerHtml,
	decodeEntities,
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
	{
		name: 'parseHtml: decodes HTML entities in text nodes (regression: & rendered as &amp;)',
		fn: async () => {
			// Bug: text nodes were stored verbatim, so `&amp;` survived into a SECOND
			// XML-encoding pass (encodeXmlEntities) → `&amp;amp;` → PowerPoint showed `&amp;`.
			// parseHtml now decodes entities once at parse time; the single downstream encode
			// then yields correct OOXML.
			assert(textOf(parseHtml('<p>Tom &amp; Jerry</p>')) === 'Tom & Jerry', 'named &amp; decoded')
			assert(textOf(parseHtml('<p>a &lt;b&gt; c</p>')) === 'a <b> c', '&lt;/&gt; decoded')
			assert(textOf(parseHtml('<p>&quot;hi&apos;</p>')) === '"hi\'', '&quot;/&apos; decoded')
			assert(textOf(parseHtml('<p>&#65;&#x42;</p>')) === 'AB', 'decimal + hex numeric decoded')
			assert(textOf(parseHtml('<p>x&nbsp;y</p>')) === 'x y', '&nbsp; → U+00A0')
			// Single-pass: a double-encoded entity decodes exactly ONCE (never over-decoded).
			assert(textOf(parseHtml('<p>&amp;lt;</p>')) === '&lt;', '&amp;lt; → &lt; (decoded once, not <)')
			// Unknown entities and bare ampersands are left intact.
			assert(textOf(parseHtml('<p>&bogus;</p>')) === '&bogus;', 'unknown entity left intact')
			assert(textOf(parseHtml('<p>a & b</p>')) === 'a & b', 'bare ampersand left intact')
			// outerHtml re-encodes on output, so the parse→serialize round-trip stays correct.
			const root = parseHtml('<p>Tom &amp; Jerry</p>')
			assert(outerHtml(queryOne(root, 'p')) === '<p>Tom &amp; Jerry</p>', 'round-trip re-encodes &')
		},
	},
	{
		name: 'node-arg: query/matches/closest accept an HNode (cheerio containment parity)',
		fn: async () => {
			// docs/feature-html-query-node-containment.md
			const root = parseHtml('<div class="a"><section><span id="x">hi</span></section></div>')
			const a = queryOne(root, '.a')
			const sec = queryOne(root, 'section')
			const span = queryOne(root, '#x')

			// query(root, node) — descendant test
			assert(query(a, span).length === 1, 'span is a descendant of .a')
			assert(query(a, span)[0] === span, 'query returns the node itself')
			assert(query(sec, a).length === 0, 'a is NOT a descendant of section')
			assert(query(a, a).length === 0, 'self is not a descendant of self')

			// matches(node, node) — identity
			assert(matches(span, span) === true, 'identity match')
			assert(matches(span, sec) === false, 'different nodes do not match')

			// closest(node, node) — ancestor-or-self identity
			assert(closest(span, a) === a, 'a is an ancestor of span')
			assert(closest(span, span) === span, 'self is its own closest')
			assert(closest(a, span) === null, 'span is a descendant, not an ancestor of a')

			// strings still work unchanged
			assert(query(root, 'section').length === 1, 'string query unchanged')
			assert(matches(span, '#x') === true, 'string matches unchanged')

			// exported containment primitive
			assert(isAncestorOrSelf(a, span) === true, 'isAncestorOrSelf exported and correct')
			assert(isAncestorOrSelf(span, a) === false, 'isAncestorOrSelf direction respected')
		},
	},
	{
		name: 'node-arg: invalid (non-string/non-HNode) selector throws a typed TypeError',
		fn: async () => {
			const root = parseHtml('<div class="a"><span id="x">hi</span></div>')
			const span = queryOne(root, '#x')
			for (const fn of [
				() => query(root, 42),
				() => matches(span, 42),
				() => closest(span, 42),
				() => query(root, null),
			]) {
				let err = null
				try { fn() } catch (e) { err = e }
				assert(err instanceof TypeError, 'expected a TypeError for a bad arg type')
				assert(!/\[object Object\]/.test(err.message), 'must not emit the opaque [object Object] error; got: ' + err.message)
			}
		},
	},
	// ── decodeEntities ──────────────────────────────────────────────────────────
	{
		name: 'decodeEntities: common named entities decode correctly',
		fn: async () => {
			assert(decodeEntities('&middot;') === '\u00B7', 'middot')
			assert(decodeEntities('&mdash;') === '\u2014', 'mdash')
			assert(decodeEntities('&ndash;') === '\u2013', 'ndash')
			assert(decodeEntities('&hellip;') === '\u2026', 'hellip')
			assert(decodeEntities('&rsquo;') === '\u2019', 'rsquo')
			assert(decodeEntities('&lsquo;') === '\u2018', 'lsquo')
			assert(decodeEntities('&rdquo;') === '\u201D', 'rdquo')
			assert(decodeEntities('&ldquo;') === '\u201C', 'ldquo')
			assert(decodeEntities('&bull;') === '\u2022', 'bull')
			assert(decodeEntities('&times;') === '\u00D7', 'times')
			assert(decodeEntities('&copy;') === '\u00A9', 'copy')
			assert(decodeEntities('&trade;') === '\u2122', 'trade')
			assert(decodeEntities('&deg;') === '\u00B0', 'deg')
			assert(decodeEntities('&euro;') === '\u20AC', 'euro')
			assert(decodeEntities('&rarr;') === '\u2192', 'rarr')
		},
	},
	{
		name: 'decodeEntities: unknown entities pass through verbatim',
		fn: async () => {
			assert(decodeEntities('&notareal;') === '&notareal;', 'unknown entity left intact')
		},
	},
	{
		name: 'decodeEntities: one-level decode invariant (no double-decode)',
		fn: async () => {
			assert(decodeEntities('&amp;middot;') === '&middot;', '&amp;middot; → &middot; (not ·)')
		},
	},
	{
		name: 'decodeEntities: numeric entities (decimal and hex)',
		fn: async () => {
			assert(decodeEntities('&#169;') === '\u00A9', '&#169; → ©')
			assert(decodeEntities('&#x1F3B5;') === '\uD83C\uDFB5', '&#x1F3B5; → 🎵')
		},
	},
	{
		name: 'decodeEntities: case sensitivity (named refs are case-sensitive)',
		fn: async () => {
			assert(decodeEntities('&Amp;') === '&Amp;', '&Amp; passes through (not same as &amp;)')
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
