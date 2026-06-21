'use strict'

// SAU-70 (library) — consolidate duplicated parse helpers + fix two silent colour fallbacks.
// Tests run against the BUILT bundle (src/bld/utils.cjs.js) so they exercise shipped output.
//
//  (1) Badge colour is now OPTIONAL and OMITTED when undetectable (no empty-string sentinel).
//  (2) A broken SVG gradient ref (url(#id) whose <gradient> is outside the captured subtree) no
//      longer silently blackens — it prefers currentColor / defaultFill over black.
//  (3) The de-duped helpers (leadingEmoji / isFontIconEl guard / tile-row rule) behave identically
//      across parseCards and parseTiles, the two former call sites.

const { parseCards, parseSvg, parseTiles } = require('../src/bld/utils.cjs.js')
const { assert } = require('./helpers')

module.exports = [
	// ── (1) badge colour omit-when-undetectable ─────────────────────────────────────────────
	{
		name: 'SAU-70: badge with no detectable colour → badge.color OMITTED (not "")',
		fn: async () => {
			const html = '<div class="grid">' +
				'<div class="card"><div class="title">A</div><span class="badge">New</span></div>' +
				'<div class="card"><div class="title">B</div><span class="badge">Hot</span></div>' +
				'</div>'
			const a = parseCards(html)
			assert(a.length === 2, 'expected 2 cards; got ' + a.length)
			assert(a[0].badge && a[0].badge.text === 'New', 'badge text preserved; got ' + JSON.stringify(a[0].badge))
			assert(!('color' in a[0].badge), 'badge.color must be OMITTED when undetectable; got ' + JSON.stringify(a[0].badge))
		},
	},
	{
		name: 'SAU-70: badge WITH a detectable bg colour → badge.color still set (6-hex)',
		fn: async () => {
			const html = '<div class="grid">' +
				'<div class="card"><div class="title">A</div><span class="badge" style="background:#ff8800">New</span></div>' +
				'<div class="card"><div class="title">B</div><span class="badge" style="background:#ff8800">Hot</span></div>' +
				'</div>'
			const a = parseCards(html)
			assert(a[0].badge.color === 'FF8800', 'expected FF8800; got ' + a[0].badge.color)
		},
	},
	// ── (2) broken SVG gradient ref no longer blackens ───────────────────────────────────────
	{
		name: 'SAU-70: fill=url(#missing) with currentColor stroke → solid currentColor, NOT black',
		fn: async () => {
			// The <linearGradient> is intentionally absent. The element carries a concrete stroke,
			// so the broken-ref fill should inherit that colour rather than degrade to 000000.
			const svg = '<svg viewBox="0 0 10 10"><path d="M0 0 L10 0 L10 10 Z" fill="url(#missing)" stroke="#E10000"/></svg>'
			const parts = parseSvg(svg)
			assert(parts.length >= 1, 'expected ≥1 part; got ' + parts.length)
			assert(typeof parts[0].fill === 'string', 'fill should be a solid hex; got ' + JSON.stringify(parts[0].fill))
			assert(parts[0].fill !== '000000', 'broken gradient ref must NOT silently blacken; got ' + parts[0].fill)
			assert(parts[0].fill === 'E10000', 'expected currentColor E10000; got ' + parts[0].fill)
		},
	},
	{
		name: 'SAU-70: fill=url(#missing) with defaultFill option → defaultFill, NOT black',
		fn: async () => {
			const svg = '<svg viewBox="0 0 10 10"><path d="M0 0 L10 0 L10 10 Z" fill="url(#missing)"/></svg>'
			const parts = parseSvg(svg, { defaultFill: '00AA55' })
			assert(parts[0].fill === '00AA55', 'expected defaultFill 00AA55; got ' + parts[0].fill)
		},
	},
	{
		name: 'SAU-70: resolvable gradient ref still produces a gradient fill (no regression)',
		fn: async () => {
			const svg = '<svg viewBox="0 0 10 10">' +
				'<defs><linearGradient id="g"><stop offset="0" stop-color="#ff0000"/><stop offset="1" stop-color="#0000ff"/></linearGradient></defs>' +
				'<path d="M0 0 L10 0 L10 10 Z" fill="url(#g)"/></svg>'
			const parts = parseSvg(svg)
			assert(parts[0].fill && typeof parts[0].fill === 'object' && parts[0].fill.type === 'gradient', 'expected gradient fill; got ' + JSON.stringify(parts[0].fill))
		},
	},
	// ── (3) consolidated helpers behave consistently across the two former call sites ─────────
	{
		name: 'SAU-70: shared leadingEmoji — emoji tile recognised by BOTH parseTiles and parseCards',
		fn: async () => {
			const html = '<div class="grid">' +
				'<div class="card"><span>🚀 Launch</span></div>' +
				'<div class="card"><span>⚙️ Build</span></div>' +
				'</div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'parseCards: expected 2; got ' + cards.length)
			assert(cards[0].icon && cards[0].icon.type === 'emoji' && cards[0].icon.text === '🚀', 'parseCards emoji icon; got ' + JSON.stringify(cards[0].icon))
			const tiles = parseTiles(html)
			assert(tiles.length === 2, 'parseTiles: expected 2; got ' + tiles.length)
			assert(tiles[0].icon && tiles[0].icon.type === 'emoji' && tiles[0].icon.text === '🚀', 'parseTiles emoji icon; got ' + JSON.stringify(tiles[0].icon))
		},
	},
	{
		name: 'SAU-70: shared font-icon guard — a plain classed <span> is NOT a phantom icon',
		fn: async () => {
			// `detectIcon` returns a descriptor for ANY classed element; the shared isFontIconEl guard
			// must reject a non-icon-family class so it is not mistaken for an icon by either consumer.
			const html = '<div class="grid">' +
				'<div class="card"><span class="not-an-icon-family">Plain</span><div class="title">A</div></div>' +
				'<div class="card"><span class="not-an-icon-family">Plain</span><div class="title">B</div></div>' +
				'</div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2; got ' + cards.length)
			assert(cards[0].icon === undefined || cards[0].icon.type !== 'fontIcon',
				'a plain classed span must not become a phantom fontIcon; got ' + JSON.stringify(cards[0].icon))
		},
	},
	{
		name: 'SAU-70: shared font-icon guard — a recognised FA <i> IS an icon',
		fn: async () => {
			const html = '<div class="grid">' +
				'<div class="card"><i class="fas fa-rocket"></i><div class="title">A</div></div>' +
				'<div class="card"><i class="fas fa-gear"></i><div class="title">B</div></div>' +
				'</div>'
			const cards = parseCards(html)
			assert(cards[0].icon && cards[0].icon.type === 'fontIcon', 'expected fontIcon; got ' + JSON.stringify(cards[0].icon))
		},
	},
]
