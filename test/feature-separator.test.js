'use strict'

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

// inches → EMU (914400 per inch)
const EMU = 914400

module.exports = [
	{
		name: 'addSeparator horizontal default: one rect, h=thickness, w spans, gray fill, alpha 50000',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addSeparator({ x: 1, y: 3, w: 4 })
			})
			// exactly one rect
			assert((xml.match(/prst="rect"/g) || []).length === 1, 'expected exactly 1 rect; got: ' + (xml.match(/prst="rect"/g) || []).length)
			// default gray fill D4D4D8 with default opacity 0.5 -> transparency 50 -> alpha 50000
			assert(xml.indexOf('<a:srgbClr val="D4D4D8"><a:alpha val="50000"/></a:srgbClr>') !== -1,
				'expected gray fill D4D4D8 with alpha 50000; got: ' + xml)
			// geometry: w = 4in spans, h = 0.01in thickness
			assert(xml.indexOf('<a:ext cx="' + Math.round(4 * EMU) + '" cy="' + Math.round(0.01 * EMU) + '"/>') !== -1,
				'expected w=4in cx, h=0.01in cy; got: ' + xml)
			// line is none (empty <a:ln> — no stroke painted)
			assert(xml.indexOf('<a:ln></a:ln>') !== -1, 'expected line type none (empty a:ln); got: ' + xml)
		},
	},
	{
		name: 'addSeparator explicit color/thickness/opacity: exact fill + alpha (opacity 0.8 -> alpha 80000)',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addSeparator({ x: 1, y: 2, w: 3, color: 'FF0000', thickness: 0.05, opacity: 0.8 })
			})
			// opacity 0.8 -> transparency = round((1-0.8)*100) = 20 -> alpha = (100-20)*1000 = 80000
			assert(xml.indexOf('<a:srgbClr val="FF0000"><a:alpha val="80000"/></a:srgbClr>') !== -1,
				'expected FF0000 with alpha 80000; got: ' + xml)
			// thickness 0.05in -> cy
			assert(xml.indexOf('cy="' + Math.round(0.05 * EMU) + '"/>') !== -1, 'expected h=0.05in cy; got: ' + xml)
		},
	},
	{
		name: 'addSeparator vertical orientation: w=thickness, h spans',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addSeparator({ x: 2, y: 1, h: 2.5, orientation: 'vertical', thickness: 0.02 })
			})
			assert((xml.match(/prst="rect"/g) || []).length === 1, 'expected exactly 1 rect; got: ' + xml)
			// vertical: w = thickness 0.02in, h = 2.5in spans
			assert(xml.indexOf('<a:ext cx="' + Math.round(0.02 * EMU) + '" cy="' + Math.round(2.5 * EMU) + '"/>') !== -1,
				'expected vertical w=0.02in cx, h=2.5in cy; got: ' + xml)
		},
	},
	{
		name: 'addSeparator inside a group: rect composes into the group child array (not slide top-level)',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				const g = slide.addGroup({ x: 6, y: 1, w: 2, h: 2 })
				g.addSeparator({ x: 0, y: 0, w: 1, color: '00FF00' })
			})
			const grp = xml.match(/<p:grpSp>[\s\S]*<\/p:grpSp>/)
			assert(grp, 'expected a <p:grpSp>; got: ' + xml)
			const grpXml = grp[0]
			assert(grpXml.indexOf('prst="rect"') !== -1, 'expected separator rect inside group; got: ' + grpXml)
			assert(grpXml.indexOf('<a:srgbClr val="00FF00">') !== -1, 'expected separator fill inside group; got: ' + grpXml)
			// not duplicated at slide top-level
			const topLevel = xml.replace(grpXml, '')
			assert((topLevel.match(/prst="rect"/g) || []).length === 0, 'separator must be only inside the group; got: ' + topLevel)
		},
	},
	{
		name: 'addSeparator passes through animation + objectName',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addSeparator({ x: 1, y: 1, w: 4, objectName: 'MyRule', animation: { type: 'fadeIn' } })
			})
			assert(xml.indexOf('name="MyRule"') !== -1, 'expected objectName MyRule; got: ' + xml)
			// animation emits a timing tree on the slide
			assert(xml.indexOf('<p:timing>') !== -1, 'expected animation timing tree; got: ' + xml)
		},
	},
	{
		name: 'addSeparator clamps degenerate thickness/opacity (<=0 -> defaults; out-of-range opacity clamps) and never throws',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addSeparator({ x: 0, y: 0, w: 2, thickness: 0, opacity: 5 })   // thickness 0 -> 0.01; opacity 5 -> clamp 1 -> transparency 0 -> NO alpha (fully opaque)
				slide.addSeparator({ x: 0, y: 1, w: 2, thickness: -3, opacity: -1 }) // thickness -3 -> 0.01; opacity -1 -> clamp 0 -> transparency 100 -> alpha 0
			})
			// produced two valid rects, no exception thrown
			assert((xml.match(/prst="rect"/g) || []).length === 2, 'expected 2 rects; got: ' + (xml.match(/prst="rect"/g) || []).length)
			// thickness defaulted to 0.01in for both
			assert((xml.match(new RegExp('cy="' + Math.round(0.01 * EMU) + '"', 'g')) || []).length === 2,
				'expected both thickness clamped to 0.01in; got: ' + xml)
			// opacity 5 clamped to 1 (fully opaque) -> transparency 0 -> NO alpha element (just solid gray)
			assert(xml.indexOf('<a:srgbClr val="D4D4D8"/></a:solidFill>') !== -1, 'expected opacity 5 clamped to 1 -> solid gray, no alpha; got: ' + xml)
			// opacity -1 clamped to 0 (fully transparent) -> transparency 100 -> alpha 0
			assert(xml.indexOf('<a:alpha val="0"/>') !== -1, 'expected opacity -1 clamped to 0 -> alpha 0; got: ' + xml)
		},
	},
	{
		name: 'addSeparator is chainable and returns the Slide; default-off (no separator -> 0 rects)',
		fn: async () => {
			const pres = new PptxGenJS()
			const slide = pres.addSlide()
			const r = slide.addSeparator({ x: 1, y: 1, w: 4 })
			assert(r === slide, 'addSeparator should return the slide for chaining')
			// control slide with no separator (and no content) emits no rects
			const ctrlXml = await buildSlideXml(() => {})
			assert((ctrlXml.match(/prst="rect"/g) || []).length === 0, 'empty control slide must emit 0 rects (default-off); got: ' + ctrlXml)
		},
	},
]
