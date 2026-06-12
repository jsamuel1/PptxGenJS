'use strict'

/**
 * feature-arc-smooth-geometry.test.js — docs/features/feature-arc-smooth-geometry.md
 *
 * Verifies the custGeom path parser (`svgPathToOoxml` in src/gen-utils.ts) handles the
 * full SVG command set: elliptical arcs (`A`/`a`) and smooth curves (`S`/`s`, `T`/`t`).
 *
 * REGRESSION-CATCH (loop mem-1): before this fix the parser's command regex omitted
 * `A`/`S`/`T`, so an arc such as `M10 80 A 25 25 0 0 1 50 80` had its numeric args
 * swallowed by the preceding `M` and emitted as garbage `<a:lnTo>` points (overflow
 * spikes). The assertions below pin "arc → `<a:cubicBezTo>` and ZERO stray `<a:lnTo>`":
 * if the parser ever regresses to ignoring `A`/`S`/`T`, case 1 flips to 0 cubics / 3
 * garbage lines and FAILS. Tests import the built bundle, so run `npm run build` first.
 */

const JSZip = require('jszip')
const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { assert } = require('./helpers')

async function buildSlideXml(buildFn) {
	const pres = new PptxGenJS()
	const slide = pres.addSlide()
	buildFn(slide, pres)
	const buf = await pres.stream()
	const zip = await JSZip.loadAsync(buf)
	const entry = zip.file('ppt/slides/slide1.xml')
	if (!entry) throw new Error('slide1.xml missing')
	return entry.async('string')
}

function shapeXml(d, viewBox) {
	return buildSlideXml(slide => slide.addShape('rect', { x: 1, y: 1, w: 2, h: 2, svgPath: { d, viewBox } }))
}

const count = (xml, tag) => (xml.match(new RegExp('<a:' + tag + '>', 'g')) || []).length
const points = xml => [...xml.matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"\/>/g)].map(m => [Number(m[1]), Number(m[2])])

module.exports = [
	{
		// CASE 1 — simple arc; the mem-1 regression-catch assertion
		name: 'arc (A) emits cubicBezTo and ZERO stray lnTo (not mis-parsed as lineTo args)',
		fn: async () => {
			const xml = await shapeXml('M10 80 A 25 25 0 0 1 50 80', { w: 100, h: 100 })
			assert(count(xml, 'cubicBezTo') >= 1, 'expected >=1 cubicBezTo from arc; got: ' + xml)
			assert(count(xml, 'lnTo') === 0, 'arc args must NOT become lnTo points; got: ' + xml)
			assert(count(xml, 'moveTo') === 1, 'expected exactly one moveTo; got: ' + xml)
		}
	},
	{
		// CASE 2 — large-arc/sweep flag matrix: large arc splits into MORE bezier segments
		name: 'large-arc flag emits more cubicBezTo segments than the small-arc variant',
		fn: async () => {
			const vb = { w: 200, h: 200 }
			const small = await shapeXml('M80 80 A 50 50 0 0 0 125 125', vb)
			const largeA = await shapeXml('M80 80 A 50 50 0 1 0 125 125', vb)
			const largeB = await shapeXml('M80 80 A 50 50 0 1 1 125 125', vb)
			const cSmall = count(small, 'cubicBezTo')
			assert(cSmall >= 1 && count(small, 'lnTo') === 0, 'small arc should emit cubics, no lines; got: ' + small)
			assert(count(largeA, 'cubicBezTo') > cSmall, 'large-arc (1 0) should emit MORE cubics than small (' + cSmall + '); got: ' + count(largeA, 'cubicBezTo'))
			assert(count(largeB, 'cubicBezTo') > cSmall, 'large-arc (1 1) should emit MORE cubics than small (' + cSmall + '); got: ' + count(largeB, 'cubicBezTo'))
		}
	},
	{
		// CASE 3 — smooth cubic (S): first control point = reflection of previous cp2
		name: 'smooth cubic (S) reflects previous control point about the current point',
		fn: async () => {
			// M10 80 C 40 10 65 10 95 80 S 150 150 180 80
			// S cp1 = reflect(65,10) about (95,80) = (125,150); viewBox 200 -> scale 4572
			// (125,150) -> (571500, 685800)
			const xml = await shapeXml('M10 80 C 40 10 65 10 95 80 S 150 150 180 80', { w: 200, h: 200 })
			assert(count(xml, 'cubicBezTo') === 2, 'expected C + S = 2 cubicBezTo; got: ' + xml)
			assert(xml.indexOf('<a:cubicBezTo><a:pt x="571500" y="685800"/>') !== -1,
				'expected S-curve cp1 at reflected (125,150)=>(571500,685800); got: ' + xml)
		}
	},
	{
		// CASE 4 — smooth quadratic (T): control point = reflection of previous quad cp
		name: 'smooth quadratic (T) reflects previous control point and emits quadBezTo',
		fn: async () => {
			// M10 80 Q 52.5 10 95 80 T 180 80
			// T cp = reflect(52.5,10) about (95,80) = (137.5,150); scale 4572 -> (628650, 685800)
			const xml = await shapeXml('M10 80 Q 52.5 10 95 80 T 180 80', { w: 200, h: 200 })
			assert(count(xml, 'quadBezTo') === 2, 'expected Q + T = 2 quadBezTo; got: ' + xml)
			assert(count(xml, 'cubicBezTo') === 0, 'T must not emit a cubic; got: ' + xml)
			assert(xml.indexOf('<a:quadBezTo><a:pt x="628650" y="685800"/>') !== -1,
				'expected T control at reflected (137.5,150)=>(628650,685800); got: ' + xml)
		}
	},
	{
		// CASE 5 — degenerate arc (rx=ry=0) collapses to a straight line to the endpoint.
		// NOTE (deviation from spec table): the shared, tested arcToCubics expresses the
		// straight line as a DEGENERATE cubic (cp1=start, cp2=end=endpoint) rather than a
		// literal <a:lnTo>. The two are geometrically identical (zero curvature) and render
		// the same in PowerPoint; the assertion verifies that geometric truth.
		name: 'degenerate arc (zero radii) collapses to a straight line to the endpoint',
		fn: async () => {
			// M10 80 A 0 0 0 0 1 50 80 ; viewBox 100 -> scale 9144
			// start (10,80)=>(91440,731520) end (50,80)=>(457200,731520)
			const xml = await shapeXml('M10 80 A 0 0 0 0 1 50 80', { w: 100, h: 100 })
			assert(count(xml, 'lnTo') === 0, 'no extra lnTo expected; got: ' + xml)
			assert(count(xml, 'cubicBezTo') === 1, 'expected a single (degenerate) segment; got: ' + xml)
			// Straight-line cubic: control points sit on start and endpoint => no curvature.
			assert(xml.indexOf('<a:cubicBezTo><a:pt x="91440" y="731520"/><a:pt x="457200" y="731520"/><a:pt x="457200" y="731520"/></a:cubicBezTo>') !== -1,
				'expected degenerate straight-line cubic ending at (457200,731520); got: ' + xml)
		}
	},
	{
		// CASE 6 — rotated arc (x-axis-rotation = -30deg): valid cubic sequence, exact endpoint
		name: 'rotated arc emits a valid cubic sequence ending exactly at the endpoint',
		fn: async () => {
			// M10 25 A 25 10 -30 0 1 50 25 ; viewBox 60 -> scale 15240
			// endpoint (50,25) => (762000, 381000)
			const xml = await shapeXml('M10 25 A 25 10 -30 0 1 50 25', { w: 60, h: 60 })
			assert(count(xml, 'cubicBezTo') >= 1, 'expected >=1 cubicBezTo from rotated arc; got: ' + xml)
			assert(count(xml, 'lnTo') === 0, 'rotated arc args must NOT become lnTo; got: ' + xml)
			assert(xml.indexOf('<a:pt x="762000" y="381000"/></a:cubicBezTo>') !== -1,
				'expected final on-path point at exact endpoint (762000,381000); got: ' + xml)
		}
	},
	{
		// CASE 7 — real-world multi-arc path (a 4-arc circle): every command consumed,
		// no leftover numbers as garbage points, all emitted points within the viewBox
		// (no overflow spike).
		name: 'multi-arc path: all commands consumed, no lnTo, points stay within viewBox',
		fn: async () => {
			// viewBox 100 -> scale 9144 -> pathW = 914400
			const d = 'M50 10 A 40 40 0 0 1 90 50 A 40 40 0 0 1 50 90 A 40 40 0 0 1 10 50 A 40 40 0 0 1 50 10 Z'
			const xml = await shapeXml(d, { w: 100, h: 100 })
			assert(count(xml, 'cubicBezTo') >= 4, 'expected >=4 cubicBezTo (one+ per arc); got: ' + count(xml, 'cubicBezTo'))
			assert(count(xml, 'lnTo') === 0, 'no command should be mis-parsed into lnTo; got: ' + xml)
			const pts = points(xml)
			assert(pts.length > 0, 'expected emitted points; got: ' + xml)
			const PATH_W = 914400
			for (const [px, py] of pts) {
				assert(px >= 0 && px <= PATH_W && py >= 0 && py <= PATH_W,
					'point (' + px + ',' + py + ') overflowed viewBox [0,' + PATH_W + '] (garbage spike); got: ' + xml)
			}
		}
	}
]
