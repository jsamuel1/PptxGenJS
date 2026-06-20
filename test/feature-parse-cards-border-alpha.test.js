'use strict'

// SAU-64 (library) — parseCards() must extract border ALPHA into CardData.colors.borderTransparency.
// Previously parseCards only set colors.borderColor, leaving the consumer's borderTransparency branch
// a permanent dead branch for every library-parsed card. These tests run against the BUILT bundle
// (src/bld/utils.cjs.js) and prove (a) the extraction, and (b) the end-to-end mapping into a shape
// line.transparency emits <a:alpha> in the OOXML — the contract the converter relies on.

const { parseCards } = require('../src/bld/utils.cjs.js')
const { build, readEntry, assert } = require('./helpers')

function cards(html) {
	return parseCards(html)
}

// rgba()/8-digit-hex border on a 2+ card grid
const RGBA_HTML = '<div class="grid">' +
	'<div class="card" style="border:2px solid rgba(0,0,0,0.4)"><div class="title">A</div></div>' +
	'<div class="card" style="border:2px solid rgba(0,0,0,0.4)"><div class="title">B</div></div>' +
	'</div>'
const HEX8_HTML = '<div class="grid">' +
	'<div class="card" style="border:1px solid #11223366"><div class="title">A</div></div>' +
	'<div class="card" style="border:1px solid #11223366"><div class="title">B</div></div>' +
	'</div>'
const OPAQUE_HTML = '<div class="grid">' +
	'<div class="card" style="border:1px solid #112233"><div class="title">A</div></div>' +
	'<div class="card" style="border:1px solid rgb(10,20,30)"><div class="title">B</div></div>' +
	'</div>'
const BORDER_COLOR_HTML = '<div class="grid">' +
	'<div class="card" style="border-color:rgba(255,0,0,0.25)"><div class="title">A</div></div>' +
	'<div class="card" style="border-color:rgba(255,0,0,0.25)"><div class="title">B</div></div>' +
	'</div>'

module.exports = [
	{
		name: 'parseCards border rgba(...,0.4) → colors.borderTransparency === 60 (and borderColor set)',
		fn: async () => {
			const a = cards(RGBA_HTML)
			assert(a.length === 2, 'expected 2 cards; got ' + a.length)
			assert(a[0].colors.borderColor === '000000', 'borderColor 000000; got ' + a[0].colors.borderColor)
			assert(a[0].colors.borderTransparency === 60, 'borderTransparency 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'parseCards border #11223366 (alpha 0x66) → colors.borderTransparency === 60',
		fn: async () => {
			const a = cards(HEX8_HTML)
			assert(a.length === 2, 'expected 2 cards; got ' + a.length)
			assert(a[0].colors.borderColor === '112233', 'borderColor 112233; got ' + a[0].colors.borderColor)
			// 0x66 = 102 → alpha 102/255 = 0.4 → transparency round((1-0.4)*100) = 60
			assert(a[0].colors.borderTransparency === 60, 'borderTransparency 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'parseCards border-color rgba(...,0.25) → colors.borderTransparency === 75',
		fn: async () => {
			const a = cards(BORDER_COLOR_HTML)
			assert(a[0].colors.borderTransparency === 75, 'borderTransparency 75; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'parseCards opaque border (#rrggbb / rgb()) → borderTransparency omitted (default-off)',
		fn: async () => {
			const a = cards(OPAQUE_HTML)
			assert(a.length === 2, 'expected 2 cards; got ' + a.length)
			assert(a[0].colors.borderTransparency === undefined, 'card0 borderTransparency undefined; got ' + a[0].colors.borderTransparency)
			assert(a[1].colors.borderTransparency === undefined, 'card1 borderTransparency undefined; got ' + a[1].colors.borderTransparency)
		},
	},
	{
		name: 'end-to-end: parsed borderTransparency → shape line.transparency emits <a:alpha>',
		fn: async () => {
			const a = cards(RGBA_HTML)
			const cl = a[0].colors
			assert(cl.borderTransparency > 0, 'precondition: borderTransparency > 0; got ' + cl.borderTransparency)
			const { zip } = await build(p => {
				const s = p.addSlide()
				// Mirror the converter contract: map CardData border colour + alpha onto a line.
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 2, h: 1, fill: 'FFFFFF',
					line: { color: cl.borderColor, width: 2, transparency: cl.borderTransparency },
				})
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// transparency 60 → (100-60)*1000 = 40000
			assert(xml.includes('<a:alpha val="40000"/>'), 'expected <a:alpha val="40000"/>; got: ' + xml.slice(0, 800))
		},
	},
	{
		name: 'end-to-end: opaque parsed border → no <a:alpha> (byte-identical default-off)',
		fn: async () => {
			const a = cards(OPAQUE_HTML)
			const cl = a[0].colors
			const { zip } = await build(p => {
				const s = p.addSlide()
				const line = { color: cl.borderColor, width: 1 }
				if (cl.borderTransparency != null && cl.borderTransparency > 0) line.transparency = cl.borderTransparency
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: 'FFFFFF', line })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(!xml.includes('<a:alpha'), 'expected no <a:alpha> for opaque border; got: ' + xml.slice(0, 800))
		},
	},
]
