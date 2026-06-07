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

// 914400 EMU = 1 inch; viewBox width maps to 1 inch (scale = 914400 / viewBoxWidth)
const EMU_PER_INCH = 914400

module.exports = [
	{
		name: 'addShape with svgPath (triangle) emits <a:custGeom> not <a:prstGeom>',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', {
					x: 1, y: 1, w: 2, h: 2,
					fill: { color: '7C3AED' },
					svgPath: { d: 'M 0 0 L 12 0 L 6 12 Z', viewBox: { w: 12, h: 12 } }
				})
			})
			assert(xml.indexOf('<a:custGeom>') !== -1, 'expected <a:custGeom>; got: ' + xml)
			assert(xml.indexOf('<a:prstGeom') === -1, 'expected no <a:prstGeom> when svgPath set; got: ' + xml)
			assert(xml.indexOf('<a:pathLst>') !== -1, 'expected <a:pathLst>; got: ' + xml)
		}
	},
	{
		name: 'triangle path emits moveTo, two lnTo, and close in order with correct EMU coords',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', {
					x: 1, y: 1, w: 2, h: 2,
					svgPath: { d: 'M 0 0 L 12 0 L 6 12 Z', viewBox: { w: 12, h: 12 } }
				})
			})
			// scale = 914400 / 12 = 76200 per unit
			const u = EMU_PER_INCH / 12
			// path w/h: viewBox * scale => 914400 x 914400
			assert(xml.indexOf(`<a:path w="${EMU_PER_INCH}" h="${EMU_PER_INCH}">`) !== -1,
				'expected <a:path w/h> scaled to 914400; got: ' + xml)
			// M 0 0
			assert(xml.indexOf('<a:moveTo><a:pt x="0" y="0"/></a:moveTo>') !== -1,
				'expected moveTo at 0,0; got: ' + xml)
			// L 12 0 => x = 12*u = 914400, y=0
			assert(xml.indexOf(`<a:lnTo><a:pt x="${12 * u}" y="0"/></a:lnTo>`) !== -1,
				'expected lnTo at 914400,0; got: ' + xml)
			// L 6 12 => x = 6*u = 457200, y = 12*u = 914400
			assert(xml.indexOf(`<a:lnTo><a:pt x="${6 * u}" y="${12 * u}"/></a:lnTo>`) !== -1,
				'expected lnTo at 457200,914400; got: ' + xml)
			// Z
			assert(xml.indexOf('<a:close/>') !== -1, 'expected close; got: ' + xml)

			// Ordering: moveTo < first lnTo < close
			const iMove = xml.indexOf('<a:moveTo>')
			const iLn = xml.indexOf('<a:lnTo>')
			const iClose = xml.indexOf('<a:close/>')
			assert(iMove < iLn && iLn < iClose, 'expected moveTo < lnTo < close ordering')
		}
	},
	{
		name: 'cubic (C) command emits <a:cubicBezTo> with three points',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', {
					x: 1, y: 1, w: 2, h: 2,
					svgPath: { d: 'M 0 0 C 0 6 6 6 12 12', viewBox: { w: 12, h: 12 } }
				})
			})
			const m = xml.match(/<a:cubicBezTo>(.*?)<\/a:cubicBezTo>/)
			assert(m !== null, 'expected <a:cubicBezTo>; got: ' + xml)
			const ptCount = (m[1].match(/<a:pt /g) || []).length
			assert(ptCount === 3, 'expected 3 control/end points in cubicBezTo; got ' + ptCount)
		}
	},
	{
		name: 'quadratic (Q) command emits <a:quadBezTo> with two points',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', {
					x: 1, y: 1, w: 2, h: 2,
					svgPath: { d: 'M 0 0 Q 6 0 12 12', viewBox: { w: 12, h: 12 } }
				})
			})
			const m = xml.match(/<a:quadBezTo>(.*?)<\/a:quadBezTo>/)
			assert(m !== null, 'expected <a:quadBezTo>; got: ' + xml)
			const ptCount = (m[1].match(/<a:pt /g) || []).length
			assert(ptCount === 2, 'expected 2 points in quadBezTo; got ' + ptCount)
		}
	},
	{
		name: 'H and V commands emit lnTo using tracked current position',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', {
					x: 1, y: 1, w: 2, h: 2,
					svgPath: { d: 'M 0 0 H 12 V 12 Z', viewBox: { w: 12, h: 12 } }
				})
			})
			const u = EMU_PER_INCH / 12
			// H 12 => x=914400, y stays 0
			assert(xml.indexOf(`<a:lnTo><a:pt x="${12 * u}" y="0"/></a:lnTo>`) !== -1,
				'expected horizontal lnTo to 914400,0; got: ' + xml)
			// V 12 => x stays 914400, y=914400
			assert(xml.indexOf(`<a:lnTo><a:pt x="${12 * u}" y="${12 * u}"/></a:lnTo>`) !== -1,
				'expected vertical lnTo to 914400,914400; got: ' + xml)
		}
	},
	{
		name: 'relative commands (m/l) are converted to absolute coordinates',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', {
					x: 1, y: 1, w: 2, h: 2,
					// m 0 0 then l 6 0 (rel) then l 0 6 (rel) => absolute (0,0)->(6,0)->(6,6)
					svgPath: { d: 'm 0 0 l 6 0 l 0 6 z', viewBox: { w: 12, h: 12 } }
				})
			})
			const u = EMU_PER_INCH / 12
			assert(xml.indexOf('<a:moveTo><a:pt x="0" y="0"/></a:moveTo>') !== -1,
				'expected moveTo 0,0; got: ' + xml)
			assert(xml.indexOf(`<a:lnTo><a:pt x="${6 * u}" y="0"/></a:lnTo>`) !== -1,
				'expected lnTo abs 457200,0; got: ' + xml)
			assert(xml.indexOf(`<a:lnTo><a:pt x="${6 * u}" y="${6 * u}"/></a:lnTo>`) !== -1,
				'expected lnTo abs 457200,457200 (relative accumulated); got: ' + xml)
		}
	},
	{
		name: 'shape without svgPath still emits <a:prstGeom> (no regression)',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addShape('rect', { x: 1, y: 1, w: 2, h: 2, fill: { color: 'FF0000' } })
			})
			assert(xml.indexOf('<a:prstGeom prst="rect">') !== -1, 'expected <a:prstGeom prst="rect">; got: ' + xml)
			assert(xml.indexOf('<a:custGeom>') === -1, 'expected no <a:custGeom> without svgPath; got: ' + xml)
		}
	}
]
