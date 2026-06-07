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

// Pull the opening <a:bodyPr ...> tag (attributes only, up to the closing '>').
function bodyPrOpenTag(xml) {
	const m = xml.match(/<a:bodyPr[^>]*>/)
	return m ? m[0] : ''
}

module.exports = [
	{
		name: 'addText columns:2 emits numCol="2" and spcCol default 0.5in (457200 EMU) on <a:bodyPr>',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('two column text', { x: 1, y: 1, w: 6, h: 3, columns: 2 })
			})
			const tag = bodyPrOpenTag(xml)
			assert(tag.indexOf('numCol="2"') !== -1,
				'expected numCol="2" on <a:bodyPr>; got: ' + tag)
			assert(tag.indexOf('spcCol="457200"') !== -1,
				'expected default spcCol="457200" (0.5in) on <a:bodyPr>; got: ' + tag)
		}
	},
	{
		name: 'addText columnSpacing:0.4 emits spcCol="365760" EMU',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('two column text', { x: 1, y: 1, w: 6, h: 3, columns: 2, columnSpacing: 0.4 })
			})
			const tag = bodyPrOpenTag(xml)
			// 0.4 * 914400 = 365760
			assert(tag.indexOf('numCol="2"') !== -1,
				'expected numCol="2" on <a:bodyPr>; got: ' + tag)
			assert(tag.indexOf('spcCol="365760"') !== -1,
				'expected spcCol="365760" (0.4in) on <a:bodyPr>; got: ' + tag)
		}
	},
	{
		name: 'numCol/spcCol are attributes inside the opening tag, not separate elements',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('two column text', { x: 1, y: 1, w: 6, h: 3, columns: 2 })
			})
			// Must not appear as standalone elements
			assert(xml.indexOf('<a:numCol') === -1, 'numCol must not be an element; got: ' + xml)
			assert(xml.indexOf('<a:spcCol') === -1, 'spcCol must not be an element; got: ' + xml)
		}
	},
	{
		name: 'no columns option => no numCol/spcCol emitted',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('single column text', { x: 1, y: 1, w: 6, h: 3 })
			})
			assert(xml.indexOf('numCol') === -1, 'expected no numCol when columns unset; got: ' + xml)
			assert(xml.indexOf('spcCol') === -1, 'expected no spcCol when columns unset; got: ' + xml)
		}
	},
	{
		name: 'columns:1 (<= 1) => no numCol emitted',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('single column text', { x: 1, y: 1, w: 6, h: 3, columns: 1 })
			})
			assert(xml.indexOf('numCol') === -1, 'expected no numCol when columns=1; got: ' + xml)
		}
	}
]
