'use strict'

// Feature: css-context layout interpreter functions (cssProp, gridColumnsOf, flexInfoOf, columnCountOf, sizeOf)
// Tests the layout-aware CSS property extraction helpers added to src/utils/css-context.ts.

const { assert, assertEqual } = require('./helpers')
// Import through the BUILT PUBLIC ENTRY — never an internal bundle (TESTING.md rule 1;
// the original export-gap incident was hidden by a test-only css-context bundle).
const { cssProp, gridColumnsOf, flexInfoOf, columnCountOf, sizeOf, parseStyleSheets, EMPTY_CSS, parseHtml } = require('../src/bld/utils.cjs.js')

/** Helper: parse HTML, return first element matching tag (depth-first). */
function el(html) {
	const root = parseHtml(html)
	// root is usually the wrapper; find first real element child
	function find(n) {
		if (n.tag && n.tag !== '') return n
		for (const c of (n.children || [])) {
			const r = find(c)
			if (r) return r
		}
		return n
	}
	return find(root)
}

module.exports = [
	// --- cssProp ---
	{
		name: 'cssProp: inline style wins over class rule',
		fn: async () => {
			const ctx = parseStyleSheets('<style>.x { color: red }</style>')
			const node = el('<div class="x" style="color: blue"></div>')
			assertEqual(cssProp(node, 'color', ctx), 'blue', 'inline should win')
		},
	},
	{
		name: 'cssProp: var() resolved from :root',
		fn: async () => {
			const ctx = parseStyleSheets('<style>:root { --fg: green } .a { color: var(--fg) }</style>')
			const node = el('<span class="a"></span>')
			assertEqual(cssProp(node, 'color', ctx), 'green', 'var() should resolve')
		},
	},
	{
		name: 'cssProp: returns undefined when property is absent',
		fn: async () => {
			const node = el('<p></p>')
			assertEqual(cssProp(node, 'color', EMPTY_CSS), undefined, 'absent → undefined')
		},
	},

	// --- gridColumnsOf ---
	{
		name: 'gridColumnsOf: explicit tracks counted (1fr 200px auto → 3)',
		fn: async () => {
			const node = el('<div style="display:grid; grid-template-columns: 1fr 200px auto"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), 3)
		},
	},
	{
		name: 'gridColumnsOf: repeat(3, 1fr) → 3',
		fn: async () => {
			const node = el('<div style="grid-template-columns: repeat(3, 1fr)"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), 3)
		},
	},
	{
		name: 'gridColumnsOf: repeat(2, 1fr 2fr) → 4',
		fn: async () => {
			const node = el('<div style="grid-template-columns: repeat(2, 1fr 2fr)"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), 4)
		},
	},
	{
		name: 'gridColumnsOf: auto-fit → undefined',
		fn: async () => {
			const node = el('<div style="grid-template-columns: repeat(auto-fit, minmax(100px, 1fr))"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'gridColumnsOf: auto-fill → undefined',
		fn: async () => {
			const node = el('<div style="grid-template-columns: repeat(auto-fill, 200px)"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'gridColumnsOf: var()-resolved from class rule',
		fn: async () => {
			const ctx = parseStyleSheets('<style>:root { --cols: 1fr 1fr 1fr 1fr } .g { grid-template-columns: var(--cols) }</style>')
			const node = el('<div class="g"></div>')
			assertEqual(gridColumnsOf(node, ctx), 4)
		},
	},
	{
		name: 'gridColumnsOf: absent → undefined',
		fn: async () => {
			const node = el('<div></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), undefined)
		},
	},

	// --- flexInfoOf ---
	{
		name: 'flexInfoOf: display:flex detected with defaults',
		fn: async () => {
			const node = el('<div style="display: flex"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assert(info !== undefined, 'should return info for flex')
			assertEqual(info.direction, 'row')
			assertEqual(info.wrap, false)
			assertEqual(info.grow, undefined)
		},
	},
	{
		name: 'flexInfoOf: direction column, wrap, grow parsed',
		fn: async () => {
			const node = el('<div style="display:flex; flex-direction:column; flex-wrap:wrap; flex-grow:2"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assertEqual(info.direction, 'column')
			assertEqual(info.wrap, true)
			assertEqual(info.grow, 2)
		},
	},
	{
		name: 'flexInfoOf: shorthand flex:1 yields grow=1',
		fn: async () => {
			const node = el('<div style="display:flex; flex:1"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assertEqual(info.grow, 1)
		},
	},
	{
		name: 'flexInfoOf: non-flex display → undefined',
		fn: async () => {
			const node = el('<div style="display:block"></div>')
			assertEqual(flexInfoOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'flexInfoOf: no display → undefined',
		fn: async () => {
			const node = el('<div></div>')
			assertEqual(flexInfoOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'flexInfoOf: nowrap is not wrap',
		fn: async () => {
			const node = el('<div style="display:flex; flex-wrap:nowrap"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assertEqual(info.wrap, false)
		},
	},
	{
		name: 'flexInfoOf: explicit flex-grow wins over flex shorthand',
		fn: async () => {
			const node = el('<div style="display:flex; flex: 1; flex-grow: 2"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assertEqual(info.grow, 2)
		},
	},
	{
		name: 'flexInfoOf: flex-flow column wrap parsed',
		fn: async () => {
			const node = el('<div style="display:flex; flex-flow: column wrap"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assertEqual(info.direction, 'column')
			assertEqual(info.wrap, true)
		},
	},
	{
		name: 'flexInfoOf: flex-flow nowrap does not set wrap',
		fn: async () => {
			const node = el('<div style="display:flex; flex-flow: row nowrap"></div>')
			const info = flexInfoOf(node, EMPTY_CSS)
			assertEqual(info.direction, 'row')
			assertEqual(info.wrap, false)
		},
	},

	// --- columnCountOf ---
	{
		name: 'columnCountOf: numeric value returned',
		fn: async () => {
			const node = el('<div style="column-count: 3"></div>')
			assertEqual(columnCountOf(node, EMPTY_CSS), 3)
		},
	},
	{
		name: 'columnCountOf: absent → undefined',
		fn: async () => {
			const node = el('<div></div>')
			assertEqual(columnCountOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'columnCountOf: non-numeric (auto) → undefined',
		fn: async () => {
			const node = el('<div style="column-count: auto"></div>')
			assertEqual(columnCountOf(node, EMPTY_CSS), undefined)
		},
	},

	// --- sizeOf ---
	{
		name: 'sizeOf: px values parsed',
		fn: async () => {
			const node = el('<div style="width: 300px; height: 150px"></div>')
			const s = sizeOf(node, EMPTY_CSS)
			assertEqual(s.wPx, 300)
			assertEqual(s.hPx, 150)
		},
	},
	{
		name: 'sizeOf: non-px → undefined',
		fn: async () => {
			const node = el('<div style="width: 50%; height: 10em"></div>')
			assertEqual(sizeOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'sizeOf: absent → undefined',
		fn: async () => {
			const node = el('<div></div>')
			assertEqual(sizeOf(node, EMPTY_CSS), undefined)
		},
	},
	{
		name: 'sizeOf: partial (only width)',
		fn: async () => {
			const node = el('<div style="width: 200px"></div>')
			const s = sizeOf(node, EMPTY_CSS)
			assertEqual(s.wPx, 200)
			assertEqual(s.hPx, undefined)
		},
	},
	{
		name: 'sizeOf: decimal px values parsed',
		fn: async () => {
			const node = el('<div style="width: 100.5px; height: 50.25px"></div>')
			const s = sizeOf(node, EMPTY_CSS)
			assertEqual(s.wPx, 100.5)
			assertEqual(s.hPx, 50.25)
		},
	},

	// --- parseCards grid detection via class rule ---
	{
		name: 'parseCards detects 2×3 grid declared via class rule only',
		fn: async () => {
			const { parseCards } = require('../src/bld/utils.cjs.js')
			const html = '<style>.grid { display: grid; grid-template-columns: 1fr 1fr 1fr }</style><div class="grid"><div>A</div><div>B</div><div>C</div><div>D</div><div>E</div><div>F</div></div>'
			const cards = parseCards(html)
			assert(cards.length === 6, `expected 6 cards, got ${cards.length}`)
		},
	},

	// --- Review-findings regression guards (docs/features/feature-css-context-layout.md §Review findings) ---
	// These are the exact inputs that failed before 89d2b121; they must stay in the suite.
	{
		name: 'gridColumnsOf: repeat(N, minmax(...)) counts functional value as ONE track (Tailwind grid-cols-3)',
		fn: async () => {
			const node = el('<div style="grid-template-columns: repeat(3, minmax(0, 1fr))"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), 3)
		},
	},
	{
		name: 'gridColumnsOf: standalone tracks mixed with repeat() are all counted',
		fn: async () => {
			const node = el('<div style="grid-template-columns: 200px repeat(2, 1fr)"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), 3)
		},
	},
	{
		name: 'gridColumnsOf: calc() counts as one track',
		fn: async () => {
			const node = el('<div style="grid-template-columns: calc(100% - 20px) 1fr"></div>')
			assertEqual(gridColumnsOf(node, EMPTY_CSS), 2)
		},
	},
	{
		name: '!important is stripped from cssProp values (class rule)',
		fn: async () => {
			const ctx = parseStyleSheets('<style>.x { grid-template-columns: 1fr 1fr !important }</style>')
			const node = el('<div class="x"></div>')
			assertEqual(cssProp(node, 'grid-template-columns', ctx), '1fr 1fr')
			assertEqual(gridColumnsOf(node, ctx), 2)
		},
	},
	{
		name: 'display: grid !important still detected as a card container',
		fn: async () => {
			const { parseCards } = require('../src/bld/utils.cjs.js')
			const html = '<div style="display: grid !important"><div><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>A</div></div><div><svg viewBox="0 0 24 24"><path d="M2 2"/></svg><div>B</div></div><div><svg viewBox="0 0 24 24"><path d="M3 3"/></svg><div>C</div></div></div>'
			const cards = parseCards(html)
			assert(cards.length === 3, `expected 3 cards, got ${cards.length}`)
		},
	},
	{
		name: '@media rule contents do not override base class rules',
		fn: async () => {
			const ctx = parseStyleSheets('<style>.x { grid-template-columns: repeat(3, minmax(0, 1fr)) } @media (max-width: 600px) { .x { grid-template-columns: 1fr } }</style>')
			const node = el('<div class="x"></div>')
			assertEqual(gridColumnsOf(node, ctx), 3)
		},
	},
]
