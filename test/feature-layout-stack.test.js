'use strict'

const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { layoutStack } = require('../src/bld/pptxgen.cjs.js')
const { assert } = require('./helpers')

const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps

// The library exposes layoutStack as an instance method; the pure util is also re-exported.
// Prefer whichever export is present so the suite works regardless of bundling shape.
function stack(props) {
	if (typeof layoutStack === 'function') return layoutStack(props)
	return new PptxGenJS().layoutStack(props)
}

const A = { x: 1, y: 1, w: 10, h: 6 }

module.exports = [
	{
		name: 'layoutStack: fixed blocks pack from the top with gaps; full-width',
		fn: async () => {
			const a = stack({ area: A, blocks: [{ height: 1 }, { height: 2 }], gap: 0.5 })
			assert(approx(a[0].y, 1) && approx(a[0].h, 1), 'a[0] y/h; got ' + a[0].y + '/' + a[0].h)
			assert(approx(a[1].y, 2.5) && approx(a[1].h, 2), 'a[1] y/h; got ' + a[1].y + '/' + a[1].h)
			assert(approx(a[0].w, 10) && approx(a[0].x, 1), 'a[0] full-width at area.x; got w=' + a[0].w + ' x=' + a[0].x)
		},
	},
	{
		name: 'layoutStack: a flex block absorbs the leftover space',
		fn: async () => {
			const b = stack({ area: A, blocks: [{ height: 1 }, { flex: 1 }], gap: 0.5 })
			assert(approx(b[1].h, 4.5), 'flex h should be 4.5; got ' + b[1].h)
			assert(approx(b[1].y, 2.5), 'flex y should be 2.5; got ' + b[1].y)
		},
	},
	{
		name: 'layoutStack: two flex blocks split leftover by weight (1:2)',
		fn: async () => {
			const c = stack({ area: A, blocks: [{ flex: 1 }, { flex: 2 }], gap: 0 })
			assert(approx(c[0].h, 2), 'c[0].h should be 2; got ' + c[0].h)
			assert(approx(c[1].h, 4), 'c[1].h should be 4; got ' + c[1].h)
		},
	},
	{
		name: 'layoutStack: align:center centres an under-filling fixed stack',
		fn: async () => {
			const d = stack({ area: A, blocks: [{ height: 1 }, { height: 1 }], gap: 0, align: 'center' })
			assert(approx(d[0].y, 1 + (6 - 2) / 2), 'd[0].y should be 3; got ' + d[0].y)
			assert(approx(d[1].y, 1 + (6 - 2) / 2 + 1), 'd[1].y should be 4; got ' + d[1].y)
		},
	},
	{
		name: 'layoutStack: align:end packs at the bottom; align:between spreads flush',
		fn: async () => {
			const e = stack({ area: A, blocks: [{ height: 1 }, { height: 1 }], gap: 0, align: 'end' })
			assert(approx(e[1].y + e[1].h, 7), 'align:end bottom block flush at 7; got ' + (e[1].y + e[1].h))
			const bt = stack({ area: A, blocks: [{ height: 1 }, { height: 1 }], gap: 0, align: 'between' })
			assert(approx(bt[0].y, 1), 'between: first flush top; got ' + bt[0].y)
			assert(approx(bt[1].y + bt[1].h, 7), 'between: last flush bottom; got ' + (bt[1].y + bt[1].h))
		},
	},
	{
		name: "layoutStack: overflow:'shrink' fits oversized fixed blocks toward minHeight",
		fn: async () => {
			const e = stack({ area: { ...A, h: 2 }, blocks: [{ height: 3, minHeight: 0.5 }, { height: 3, minHeight: 0.5 }], gap: 0, overflow: 'shrink' })
			assert(e[0].h + e[1].h <= 2 + 1e-9, 'shrunk total should fit 2; got ' + (e[0].h + e[1].h))
			assert(e[0].h >= 0.5 - 1e-9, 'block should not shrink below minHeight; got ' + e[0].h)
		},
	},
	{
		name: "layoutStack: overflow:'grow' flags overflow but does not resize",
		fn: async () => {
			const f = stack({ area: { ...A, h: 2 }, blocks: [{ height: 3 }], overflow: 'grow' })
			assert(f.overflow === true, 'grow should set result.overflow=true; got ' + f.overflow)
			assert(approx(f[0].h, 3), 'grow keeps natural height 3; got ' + f[0].h)
		},
	},
	{
		name: 'layoutStack: inset indents and narrows a block',
		fn: async () => {
			const g = stack({ area: A, blocks: [{ height: 1, inset: 0.5 }] })
			assert(approx(g[0].x, 1.5), 'inset x should be 1.5; got ' + g[0].x)
			assert(approx(g[0].w, 9), 'inset w should be 9; got ' + g[0].w)
		},
	},
	{
		name: 'layoutStack: guards - empty blocks -> []; non-positive area throws',
		fn: async () => {
			assert(stack({ area: A, blocks: [] }).length === 0, 'empty blocks should return []')
			let threw = false
			try {
				stack({ area: { x: 0, y: 0, w: 0, h: 0 }, blocks: [{ height: 1 }] })
			} catch (_) {
				threw = true
			}
			assert(threw, 'expected layoutStack to throw on zero-size area')
		},
	},
	{
		name: 'layoutStack: instance method matches util output',
		fn: async () => {
			const props = { area: A, blocks: [{ height: 1 }, { flex: 1 }, { height: 0.5 }], gap: 0.2 }
			const viaInstance = new PptxGenJS().layoutStack(props)
			const viaUtil = stack(props)
			assert(viaInstance.length === viaUtil.length, 'same length')
			for (let i = 0; i < viaInstance.length; i++) {
				assert(
					approx(viaInstance[i].x, viaUtil[i].x) && approx(viaInstance[i].y, viaUtil[i].y) &&
						approx(viaInstance[i].w, viaUtil[i].w) && approx(viaInstance[i].h, viaUtil[i].h),
					'instance and util box ' + i + ' should match'
				)
			}
		},
	},
]
