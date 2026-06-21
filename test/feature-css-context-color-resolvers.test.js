'use strict'

// Feature (SAU-80): the cascade-aware colour resolvers bgOfCtx/colorOf/extractHex/transparencyOf
// (used internally by parseCards) must be reachable from the built /utils public entry, so the
// converter can consume them instead of hand-rolling inline-only colour reads (ADR-0002).
const { assert, assertEqual } = require('./helpers')
// Import through the BUILT PUBLIC ENTRY (TESTING.md rule 1).
const mod = require('../src/bld/utils.cjs.js')
const { bgOfCtx, colorOf, extractHex, transparencyOf, parseStyleSheets, EMPTY_CSS, parseHtml } = mod

/** Helper: parse HTML, return first real element (depth-first). */
function el(html) {
	const root = parseHtml(html)
	function find(n) {
		if (n.tag && n.tag !== '') return n
		for (const c of (n.children || [])) { const r = find(c); if (r) return r }
		return n
	}
	return find(root)
}

module.exports = [
	{ name: 'SAU-80: four resolvers are reachable from /utils entry', fn: () => {
		for (const name of ['bgOfCtx', 'colorOf', 'extractHex', 'transparencyOf']) {
			assert(typeof mod[name] === 'function', `${name} not exported as a function`)
		}
	}},
	{ name: 'extractHex: standalone + compound values', fn: () => {
		assertEqual(extractHex('#abcdef'), 'ABCDEF', 'standalone hex')
		assertEqual(extractHex('3px solid #112233'), '112233', 'compound border')
		assertEqual(extractHex(undefined), undefined, 'undefined input')
	}},
	{ name: 'colorOf: resolves a colour from inline style via CssContext', fn: () => {
		const node = el('<span style="color: #ff0000"></span>')
		assertEqual(colorOf(node, 'color', EMPTY_CSS), 'FF0000', 'inline color')
	}},
	{ name: 'bgOfCtx: resolves background through class-rule cascade', fn: () => {
		const ctx = parseStyleSheets('<style>.card { background: #0a0b0c }</style>')
		const node = el('<div class="card"></div>')
		assertEqual(bgOfCtx(node, ctx), '0A0B0C', 'class-rule background')
	}},
	{ name: 'transparencyOf: reads alpha of a border colour through the cascade', fn: () => {
		const node = el('<div style="border: 2px solid rgba(0,0,0,0.25)"></div>')
		assertEqual(transparencyOf(node, 'border', EMPTY_CSS), 75, 'rgba .25 → 75% transparent')
		assertEqual(transparencyOf(node, 'color', EMPTY_CSS), undefined, 'absent prop → undefined')
	}},
]
