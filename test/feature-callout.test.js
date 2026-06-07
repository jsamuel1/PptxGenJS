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

module.exports = [
	{
		name: 'addCallout emits roundRect prstGeom with computed adj value',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({
					text: 'Power Tip', x: 1, y: 1, w: 1.5, h: 0.4,
					fill: '7C3AED', fontColor: 'FFFFFF', fontSize: 9, fontBold: true,
					cornerRadius: 0.15, align: 'center', valign: 'middle',
				})
			})
			assert(xml.indexOf('prst="roundRect"') !== -1, 'expected prst="roundRect"; got: ' + xml)
			// adj = round((0.15 / (0.4/2)) * 50000) = round(0.75 * 50000) = 37500
			assert(xml.indexOf('<a:gd name="adj" fmla="val 37500"/>') !== -1,
				'expected adj val 37500; got: ' + xml)
		},
	},
	{
		name: 'addCallout emits centred bold text run at the requested size',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({
					text: 'Power Tip', x: 1, y: 1, w: 1.5, h: 0.4,
					fill: '7C3AED', fontColor: 'FFFFFF', fontSize: 9, fontBold: true,
					cornerRadius: 0.15, align: 'center', valign: 'middle',
				})
			})
			assert(xml.indexOf('<a:t>Power Tip</a:t>') !== -1, 'expected callout text; got: ' + xml)
			assert(/<a:rPr[^>]* b="1"/.test(xml), 'expected bold run (b="1"); got: ' + xml)
			assert(/<a:rPr[^>]* sz="900"/.test(xml), 'expected sz="900" (9pt); got: ' + xml)
			assert(xml.indexOf('anchor="ctr"') !== -1, 'expected centred anchor; got: ' + xml)
			assert(xml.indexOf('algn="ctr"') !== -1, 'expected centred paragraph alignment; got: ' + xml)
		},
	},
	{
		name: 'addCallout fills the shape with the requested color',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({ text: 'Tag', x: 0.5, y: 0.5, w: 1, h: 0.3, fill: '1A1A24', cornerRadius: 0.1 })
			})
			assert(xml.indexOf('<a:srgbClr val="1A1A24"/>') !== -1, 'expected fill color 1A1A24; got: ' + xml)
		},
	},
]
