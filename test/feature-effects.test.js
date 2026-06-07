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
		name: 'shape shadow emits outerShdw with pt->EMU + angle + alpha conversions',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('roundRect', {
					x: 1, y: 1, w: 2, h: 1, fill: { color: '1A1A24' },
					shadow: { type: 'outer', blur: 10, offset: 3, angle: 270, color: '000000', opacity: 0.4 },
				})
			})
			assert(xml.indexOf('<a:effectLst>') !== -1, 'expected <a:effectLst>; got: ' + xml)
			assert(xml.indexOf('<a:outerShdw') !== -1, 'expected <a:outerShdw; got: ' + xml)
			assert(xml.indexOf('blurRad="127000"') !== -1, 'expected blurRad=127000 (10pt*12700); got: ' + xml)
			assert(xml.indexOf('dist="38100"') !== -1, 'expected dist=38100 (3pt*12700); got: ' + xml)
			assert(xml.indexOf('dir="16200000"') !== -1, 'expected dir=16200000 (270*60000); got: ' + xml)
			assert(xml.indexOf('<a:alpha val="40000"/>') !== -1, 'expected alpha 40000 (0.4); got: ' + xml)
			assert(xml.indexOf('<a:srgbClr val="000000">') !== -1, 'expected shadow color 000000; got: ' + xml)
			assert(xml.indexOf('</a:outerShdw>') !== -1, 'expected closing </a:outerShdw>; got: ' + xml)
		},
	},
	{
		name: 'shape glow emits <a:glow rad> with pt->EMU size and alpha',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('roundRect', {
					x: 1, y: 1, w: 2, h: 1, fill: { color: '1A1A24' },
					glow: { size: 5, color: '7C3AED', opacity: 0.3 },
				})
			})
			assert(xml.indexOf('<a:effectLst>') !== -1, 'expected <a:effectLst>; got: ' + xml)
			assert(xml.indexOf('<a:glow rad="63500">') !== -1, 'expected glow rad=63500 (5pt*12700); got: ' + xml)
			assert(xml.indexOf('<a:srgbClr val="7C3AED">') !== -1, 'expected glow color 7C3AED; got: ' + xml)
			assert(xml.indexOf('<a:alpha val="30000"/>') !== -1, 'expected glow alpha 30000 (0.3); got: ' + xml)
		},
	},
	{
		name: 'shape with both shadow and glow emits exactly one effectLst containing both',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('roundRect', {
					x: 1, y: 1, w: 2, h: 1, fill: { color: '1A1A24' },
					shadow: { type: 'outer', blur: 10, offset: 3, angle: 270, color: '000000', opacity: 0.4 },
					glow: { size: 5, color: '7C3AED', opacity: 0.3 },
				})
			})
			const effectCount = (xml.match(/<a:effectLst>/g) || []).length
			assert(effectCount === 1, 'expected exactly one <a:effectLst>; got ' + effectCount + ': ' + xml)
			assert(xml.indexOf('<a:outerShdw') !== -1, 'expected outerShdw in combined effectLst; got: ' + xml)
			assert(xml.indexOf('<a:glow rad="63500">') !== -1, 'expected glow in combined effectLst; got: ' + xml)
		},
	},
]
