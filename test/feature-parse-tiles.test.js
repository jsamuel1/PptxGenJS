'use strict'

// Feature: structure-driven icon+label tile rows (SAU-40 — the dropped AWS-service rows).
//
// A "tile row" is a horizontal strip of >=2 UNIFORM sibling tiles where each tile = one icon node
// (svg / recognised font-icon / leading emoji) + a SHORT label. Detection is STRUCTURE-driven, NOT
// class-name driven, and needs NO stylesheet-resolvable CSS — so it recovers `.stack`/`.stack-row`/
// `.reg-badge` rows AND class-token-free equivalents that parseCards/parseColumns would otherwise
// drop (msx slides 5/9/11/14/15/16: Step Functions / DynamoDB / Textract never extracted).

const { assert } = require('./helpers')
const { parseTiles, parseColumns, parseCards } = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'parseTiles: .stack-row font-icon tiles → icon + label per tile (SAU-40 DoD)',
		fn: async () => {
			// `.stack-row` of `.reg-badge` tiles, each a Font-Awesome icon + a short service label.
			const html =
				'<div class="stack-row">' +
				'  <div class="reg-badge"><i class="fas fa-cogs"></i><span>Step Functions</span></div>' +
				'  <div class="reg-badge"><i class="fas fa-database"></i><span>DynamoDB</span></div>' +
				'  <div class="reg-badge"><i class="fas fa-file-alt"></i><span>Textract</span></div>' +
				'</div>'
			const tiles = parseTiles(html)
			assert(tiles.length === 3, 'expected 3 tiles; got: ' + tiles.length)
			assert(tiles[0].label === 'Step Functions', 'tile0 label; got: ' + tiles[0].label)
			assert(tiles[1].label === 'DynamoDB', 'tile1 label; got: ' + tiles[1].label)
			assert(tiles[2].label === 'Textract', 'tile2 label; got: ' + tiles[2].label)
			assert(tiles[0].icon && tiles[0].icon.type === 'fontIcon', 'tile0 icon should be fontIcon')
			assert(tiles[0].icon.className === 'fas fa-cogs', 'tile0 icon class; got: ' + tiles[0].icon.className)
			assert(tiles[1].icon.className === 'fas fa-database', 'tile1 icon class; got: ' + tiles[1].icon.className)
		},
	},
	{
		name: 'parseTiles: CLASS-AGNOSTIC svg tile row (no card/grid class, no resolvable CSS)',
		fn: async () => {
			// No class tokens, no inline/<style> display — only the STRUCTURE (svg + short label).
			const html =
				'<section>' +
				'  <article><svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg><p>Lambda</p></article>' +
				'  <article><svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg><p>S3</p></article>' +
				'</section>'
			const tiles = parseTiles(html)
			assert(tiles.length === 2, 'expected 2 tiles; got: ' + tiles.length)
			assert(tiles[0].label === 'Lambda', 'tile0 label; got: ' + tiles[0].label)
			assert(tiles[1].label === 'S3', 'tile1 label; got: ' + tiles[1].label)
			assert(tiles[0].icon && tiles[0].icon.type === 'svg', 'tile0 icon should be svg')
			assert(/<svg/.test(tiles[0].icon.raw), 'tile0 svg raw should carry markup; got: ' + tiles[0].icon.raw)
		},
	},
	{
		name: 'parseTiles: emoji tiles → leading emoji stripped from label',
		fn: async () => {
			const html = '<div><span>🚀 Launch</span><span>🔒 Secure</span></div>'
			const tiles = parseTiles(html)
			assert(tiles.length === 2, 'expected 2 emoji tiles; got: ' + tiles.length)
			assert(tiles[0].label === 'Launch', 'tile0 label should strip emoji; got: ' + tiles[0].label)
			assert(tiles[0].icon && tiles[0].icon.type === 'emoji' && tiles[0].icon.text === '🚀', 'tile0 emoji icon')
		},
	},
	{
		name: 'parseTiles: prose flex row is NOT a tile row → [] (neutral, no false positive)',
		fn: async () => {
			// Children have NO icon and long prose → not tiles. Must return [] (additive, opt-in).
			const html =
				'<div style="display:flex;flex-direction:row">' +
				'  <div>This is a long paragraph of prose that clearly exceeds the short tile label budget by a wide margin.</div>' +
				'  <div>Another long paragraph of body copy that is plainly a column of text and not a compact icon tile label.</div>' +
				'</div>'
			const tiles = parseTiles(html)
			assert(Array.isArray(tiles) && tiles.length === 0, 'prose flex row should yield no tiles; got: ' + tiles.length)
		},
	},
	{
		name: 'parseColumns: tile row no longer flattened to text columns (gate, SAU-40)',
		fn: async () => {
			// The eager flex-row→columns branch must YIELD to the tile recogniser so icons survive.
			const html =
				'<div style="display:flex;flex-direction:row">' +
				'  <div><i class="fas fa-cogs"></i><span>Step Functions</span></div>' +
				'  <div><i class="fas fa-database"></i><span>DynamoDB</span></div>' +
				'</div>'
			const cols = parseColumns(html)
			assert(cols === null, 'parseColumns must not flatten a tile row into columns; got: ' + JSON.stringify(cols))
			const tiles = parseTiles(html)
			assert(tiles.length === 2 && tiles[0].label === 'Step Functions', 'tile row still extracted by parseTiles')
			// A genuine PROSE flex row is unaffected (ADR-0006: byte-identical for non-tile inputs).
			const prose = parseColumns('<div style="display:flex;flex-direction:row"><div>Left column body</div><div>Right column body</div></div>')
			assert(prose !== null && prose.length === 2, 'prose flex row still detected as 2 columns')
		},
	},
	{
		name: 'parseCards: class-token-free .stack tile row recognised (container gate loosened)',
		fn: async () => {
			// `.stack` carries no card/grid/tile class and no resolvable display → previously dropped.
			const html =
				'<div class="stack">' +
				'  <div><i class="fas fa-cogs"></i><span>Step Functions</span></div>' +
				'  <div><i class="fas fa-database"></i><span>DynamoDB</span></div>' +
				'  <div><i class="fas fa-file-alt"></i><span>Textract</span></div>' +
				'</div>'
			const cards = parseCards(html)
			assert(cards.length === 3, 'expected 3 cards from the tile row; got: ' + cards.length)
			const titles = cards.map(c => c.title)
			assert(titles.includes('Step Functions'), 'Step Functions should be extracted; got: ' + JSON.stringify(titles))
			assert(titles.includes('DynamoDB'), 'DynamoDB should be extracted; got: ' + JSON.stringify(titles))
			assert(titles.includes('Textract'), 'Textract should be extracted; got: ' + JSON.stringify(titles))
			assert(cards[0].icon && cards[0].icon.type === 'fontIcon', 'card0 should carry its icon')
		},
	},
	{
		name: 'parseCards: existing class-matched grid output unchanged (ADR-0006 regression guard)',
		fn: async () => {
			// A normal `.card-grid`/`.card` input must behave exactly as before the gate was loosened.
			const html =
				'<div class="card-grid">' +
				'  <div class="card"><h3>Alpha</h3><p>First body</p></div>' +
				'  <div class="card"><h3>Beta</h3><p>Second body</p></div>' +
				'</div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards; got: ' + cards.length)
			assert(cards[0].title === 'Alpha' && cards[1].title === 'Beta', 'titles unchanged')
			assert(cards[0].description === 'First body', 'desc unchanged; got: ' + cards[0].description)
		},
	},
]
