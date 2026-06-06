'use strict'

// Slice 1 — Gradient fills on shapes & text-box backgrounds (PROMPT.md §Feature 3).
// Asserts the emitted `<a:gradFill>` OOXML for shape `<p:spPr>` fills.

const { build, readEntry, assert } = require('./helpers')

// Build a single-shape deck and return that shape's slide1.xml.
async function shapeXml(fill, shape = 'rect') {
	const { zip } = await build(p => {
		const s = p.addSlide()
		s.addShape(shape, { x: 0, y: 0, w: 4, h: 1, fill })
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

module.exports = [
	{
		name: 'gradient: 2-stop horizontal → two <a:gs>, ang="0"',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'horizontal',
				stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }]
			})
			assert(xml.includes('<a:gradFill rotWithShape="1">'), 'expected gradFill rotWithShape="1"; got: ' + xml)
			assert((xml.match(/<a:gs /g) || []).length === 2, 'expected exactly two <a:gs>; got: ' + xml)
			assert(xml.includes('<a:gs pos="0"><a:srgbClr val="7C3AED"/></a:gs>'), 'expected first stop at pos=0; got: ' + xml)
			assert(xml.includes('<a:gs pos="100000"><a:srgbClr val="38BDF8"/></a:gs>'), 'expected last stop at pos=100000; got: ' + xml)
			assert(xml.includes('<a:lin ang="0" scaled="1"/>'), 'expected horizontal ang="0"; got: ' + xml)
			// solid fill must NOT appear for a gradient shape
			assert(!xml.includes('<a:solidFill>'), 'gradient shape should emit no <a:solidFill>; got: ' + xml)
		}
	},
	{
		name: 'gradient: 3-stop horizontal → pos 0 / 50000 / 100000',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'horizontal',
				stops: [
					{ position: 0, color: '7C3AED' },
					{ position: 50, color: 'A78BFA' },
					{ position: 100, color: '38BDF8' }
				]
			})
			assert((xml.match(/<a:gs /g) || []).length === 3, 'expected three <a:gs>; got: ' + xml)
			assert(xml.includes('<a:gs pos="50000"><a:srgbClr val="A78BFA"/></a:gs>'), 'expected mid stop pos=50000; got: ' + xml)
		}
	},
	{
		name: 'gradient: vertical → ang="5400000"',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'vertical',
				stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }]
			})
			assert(xml.includes('<a:lin ang="5400000" scaled="1"/>'), 'expected vertical ang="5400000"; got: ' + xml)
		}
	},
	{
		name: 'gradient: diagonal → ang="2700000"',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'diagonal',
				stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }]
			})
			assert(xml.includes('<a:lin ang="2700000" scaled="1"/>'), 'expected diagonal ang="2700000"; got: ' + xml)
		}
	},
	{
		name: 'gradient: arbitrary 30° → ang="1800000"',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 30,
				stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }]
			})
			assert(xml.includes('<a:lin ang="1800000" scaled="1"/>'), 'expected 30° ang="1800000"; got: ' + xml)
		}
	},
	{
		name: 'gradient: identical fill XML on rect and roundRect',
		fn: async () => {
			const fill = {
				type: 'gradient', direction: 'horizontal',
				stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }]
			}
			const rectXml = await shapeXml(fill, 'rect')
			const roundXml = await shapeXml(fill, 'roundRect')
			const grab = s => (s.match(/<a:gradFill[\s\S]*?<\/a:gradFill>/) || [''])[0]
			const a = grab(rectXml)
			const b = grab(roundXml)
			assert(a.length > 0, 'rect should contain a gradFill; got: ' + rectXml)
			assert(a === b, 'rect and roundRect gradient fill XML must be identical; got rect=' + a + ' round=' + b)
		}
	},
	{
		name: 'gradient: text-box background gradient emits <a:gradFill>',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addText('hello', {
					x: 1, y: 1, w: 4, h: 1,
					fill: { type: 'gradient', direction: 'vertical', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }] }
				})
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(xml.includes('<a:gradFill rotWithShape="1">'), 'expected gradFill on text box; got: ' + xml)
			assert(xml.includes('<a:lin ang="5400000" scaled="1"/>'), 'expected vertical ang on text box; got: ' + xml)
		}
	},
	{
		name: 'gradient: per-stop transparency emits <a:alpha> (direct mapping)',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'horizontal',
				stops: [{ position: 0, color: '7C3AED', transparency: 40 }, { position: 100, color: '38BDF8' }]
			})
			// PROMPT.md direct mapping: transparency 40 → <a:alpha val="40000"/>
			assert(xml.includes('<a:gs pos="0"><a:srgbClr val="7C3AED"><a:alpha val="40000"/></a:srgbClr></a:gs>'),
				'expected per-stop alpha val="40000"; got: ' + xml)
		}
	},
	{
		name: 'gradient: out-of-order stops are normalised (sorted ascending)',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'horizontal',
				stops: [
					{ position: 100, color: '38BDF8' },
					{ position: 0, color: '7C3AED' },
					{ position: 50, color: 'A78BFA' }
				]
			})
			const order = (xml.match(/<a:gs pos="(\d+)"/g) || []).map(m => m.match(/\d+/)[0])
			assert(order.join(',') === '0,50000,100000', 'expected stops sorted 0,50000,100000; got: ' + order.join(','))
		}
	},
	{
		name: 'gradient: rotWithShape:false → rotWithShape="0"',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'horizontal', rotWithShape: false,
				stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }]
			})
			assert(xml.includes('<a:gradFill rotWithShape="0">'), 'expected rotWithShape="0"; got: ' + xml)
		}
	},
	{
		name: 'gradient: scheme color stop emits <a:schemeClr>',
		fn: async () => {
			const xml = await shapeXml({
				type: 'gradient', direction: 'horizontal',
				stops: [{ position: 0, color: 'accent1' }, { position: 100, color: '38BDF8' }]
			})
			assert(xml.includes('<a:gs pos="0"><a:schemeClr val="accent1"/></a:gs>'), 'expected scheme color stop; got: ' + xml)
		}
	},
	{
		name: 'gradient: solid fill path unchanged (regression guard)',
		fn: async () => {
			const xml = await shapeXml({ color: 'FF0000' })
			assert(xml.includes('<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>'), 'solid fill must be unchanged; got: ' + xml)
			assert(!xml.includes('<a:gradFill'), 'solid fill must not emit gradFill; got: ' + xml)
		}
	}
]
