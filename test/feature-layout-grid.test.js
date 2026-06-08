'use strict'

const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { layoutGrid } = require('../src/bld/pptxgen.cjs.js')
const { assert, assertEqual } = require('./helpers')

const approx = (a, b, eps = 0.01) => Math.abs(a - b) <= eps

// The library exposes layoutGrid as an instance method; the pure util is also re-exported.
// Prefer whichever export is present so the suite works regardless of bundling shape.
function grid(props) {
	if (typeof layoutGrid === 'function') return layoutGrid(props)
	return new PptxGenJS().layoutGrid(props)
}

module.exports = [
	{
		name: 'layoutGrid: 6 items / 3 columns / 12in area, gap 0.2 -> correct cell math',
		fn: async () => {
			const g = grid({ items: 6, columns: 3, area: { x: 0, y: 0, w: 12, h: 4 }, gap: 0.2 })
			assertEqual(g.length, 6, 'expected 6 cells')
			// cellW = (12 - 2*0.2) / 3 = 3.86667
			assert(approx(g[0].x, 0), 'g[0].x should be area.x (0); got ' + g[0].x)
			// g[1].x = 0 + 1*(cellW + gapX) = 3.86667 + 0.2 = 4.06667  (per spec Calculation formula)
			assert(approx(g[1].x, 4.06667), 'g[1].x should be ~4.0667; got ' + g[1].x)
			assert(g[3].y > 0, 'g[3] should be on the second row (y > 0); got ' + g[3].y)
			assert(approx(g[5].x, g[2].x), 'g[5] and g[2] share a column; got ' + g[5].x + ' vs ' + g[2].x)
			// all cells equal-sized
			assert(approx(g[0].w, g[5].w) && approx(g[0].h, g[5].h), 'all cells equal-sized')
		},
	},
	{
		name: 'layoutGrid: 1 item / 1 column fills the entire area',
		fn: async () => {
			const g1 = grid({ items: 1, columns: 1, area: { x: 1, y: 1, w: 10, h: 5 }, gap: 0 })
			assertEqual(g1.length, 1, 'expected 1 cell')
			assert(approx(g1[0].x, 1), 'g1[0].x should be 1; got ' + g1[0].x)
			assert(approx(g1[0].w, 10), 'g1[0].w should be 10; got ' + g1[0].w)
			assert(approx(g1[0].y, 1), 'g1[0].y should be 1; got ' + g1[0].y)
			assert(approx(g1[0].h, 5), 'g1[0].h should be 5; got ' + g1[0].h)
		},
	},
	{
		name: 'layoutGrid: items=0 returns empty array',
		fn: async () => {
			const g = grid({ items: 0, columns: 3, area: { x: 0, y: 0, w: 12, h: 4 }, gap: 0.2 })
			assert(Array.isArray(g) && g.length === 0, 'expected empty array; got ' + JSON.stringify(g))
		},
	},
	{
		name: 'layoutGrid: zero-width area throws',
		fn: async () => {
			let threw = false
			try {
				grid({ items: 4, columns: 2, area: { x: 0, y: 0, w: 0, h: 4 }, gap: 0.2 })
			} catch (e) {
				threw = true
			}
			assert(threw, 'expected layoutGrid to throw on zero-width area')
		},
	},
	{
		name: 'layoutGrid: gapX/gapY overrides and second-row y placement',
		fn: async () => {
			// 4 items, 2 cols, 2 rows. gapY override = 0.5
			const g = grid({ items: 4, columns: 2, area: { x: 0, y: 0, w: 10, h: 6 }, gapX: 0.2, gapY: 0.5 })
			// cellH = (6 - 1*0.5) / 2 = 2.75 ; row 1 y = 2.75 + 0.5 = 3.25
			assert(approx(g[2].y, 3.25), 'second-row y should be ~3.25; got ' + g[2].y)
			// cellW = (10 - 0.2) / 2 = 4.9 ; g[1].x = 4.9 + 0.2 = 5.1
			assert(approx(g[1].x, 5.1), 'g[1].x should be ~5.1; got ' + g[1].x)
		},
	},
	{
		name: 'layoutGrid: instance method matches util output',
		fn: async () => {
			const props = { items: 6, columns: 3, area: { x: 0.5, y: 2, w: 12, h: 4 }, gap: 0.2 }
			const viaInstance = new PptxGenJS().layoutGrid(props)
			const viaUtil = grid(props)
			assertEqual(viaInstance.length, viaUtil.length, 'same length')
			for (let i = 0; i < viaInstance.length; i++) {
				assert(
					approx(viaInstance[i].x, viaUtil[i].x) && approx(viaInstance[i].y, viaUtil[i].y) &&
						approx(viaInstance[i].w, viaUtil[i].w) && approx(viaInstance[i].h, viaUtil[i].h),
					'instance and util cell ' + i + ' should match'
				)
			}
		},
	},
]
