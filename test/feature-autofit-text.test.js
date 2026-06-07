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
		name: "addText fit:'shrink' emits <a:normAutofit fontScale=\"70000\"/>",
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('long text that should shrink', { x: 1, y: 1, w: 4, h: 1, fit: 'shrink' })
			})
			assert(xml.indexOf('<a:normAutofit fontScale="70000"/>') !== -1,
				'expected <a:normAutofit fontScale="70000"/> for fit:shrink; got: ' + xml)
			assert(xml.indexOf('<a:spAutoFit/>') === -1,
				'fit:shrink must NOT emit <a:spAutoFit/>; got: ' + xml)
		}
	},
	{
		name: "addText fit:'resize' emits <a:spAutoFit/>",
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('resize me', { x: 1, y: 1, w: 4, h: 1, fit: 'resize' })
			})
			assert(xml.indexOf('<a:spAutoFit/>') !== -1, 'expected <a:spAutoFit/> for fit:resize; got: ' + xml)
			assert(xml.indexOf('normAutofit') === -1, 'fit:resize must NOT emit normAutofit; got: ' + xml)
		}
	},
	{
		name: "legacy autoFit:true maps to fit:'resize' (single <a:spAutoFit/>)",
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('legacy autofit', { x: 1, y: 1, w: 4, h: 1, autoFit: true })
			})
			const count = (xml.match(/<a:spAutoFit\/>/g) || []).length
			assert(count === 1, 'legacy autoFit:true must emit exactly one <a:spAutoFit/>; got ' + count + ': ' + xml)
		}
	},
	{
		name: "no fit option => no autofit element emitted",
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addText('plain text', { x: 1, y: 1, w: 4, h: 1 })
			})
			assert(xml.indexOf('spAutoFit') === -1, 'expected no spAutoFit when fit unset; got: ' + xml)
			assert(xml.indexOf('normAutofit') === -1, 'expected no normAutofit when fit unset; got: ' + xml)
		}
	}
]
