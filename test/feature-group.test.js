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
		name: 'addGroup emits <p:grpSp> with absolute xfrm + chOff/chExt',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				const g = slide.addGroup({ x: 1, y: 2, w: 8, h: 4 })
				g.addShape('rect', { x: 0, y: 0, w: 2, h: 2, fill: '1A1A24' })
			})
			assert(xml.indexOf('<p:grpSp>') !== -1, 'expected <p:grpSp>; got: ' + xml)
			assert(xml.indexOf('<p:grpSpPr>') !== -1, 'expected <p:grpSpPr>; got: ' + xml)
			// group origin: 1in -> 914400 EMU, 2in -> 1828800 EMU
			assert(xml.indexOf('<a:off x="914400" y="1828800"/>') !== -1, 'expected absolute group off 914400,1828800; got: ' + xml)
			// extent: 8in -> 7315200, 4in -> 3657600
			assert(xml.indexOf('<a:ext cx="7315200" cy="3657600"/>') !== -1, 'expected group ext 7315200x3657600; got: ' + xml)
			// child coordinate space: chOff 0,0 + chExt equal to ext
			assert(xml.indexOf('<a:chOff x="0" y="0"/>') !== -1, 'expected <a:chOff x="0" y="0"/>; got: ' + xml)
			assert(xml.indexOf('<a:chExt cx="7315200" cy="3657600"/>') !== -1, 'expected chExt 7315200x3657600; got: ' + xml)
		},
	},
	{
		name: 'addGroup nests a child shape inside the group with group-relative coords',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				const g = slide.addGroup({ x: 1, y: 1, w: 4, h: 4 })
				g.addShape('roundRect', { x: 0.5, y: 0.5, w: 1, h: 1, fill: '7C3AED' })
			})
			// child shape must appear nested inside the group element
			const grpStart = xml.indexOf('<p:grpSp>')
			const grpEnd = xml.indexOf('</p:grpSp>')
			assert(grpStart !== -1 && grpEnd !== -1 && grpEnd > grpStart, 'expected a complete <p:grpSp>…</p:grpSp>; got: ' + xml)
			const inner = xml.substring(grpStart, grpEnd)
			assert(inner.indexOf('prst="roundRect"') !== -1, 'expected child roundRect nested inside group; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'expected child fill nested inside group; got: ' + inner)
			// child coords are relative to chOff (0.5in -> 457200 EMU) — emitted inside the group
			assert(inner.indexOf('<a:off x="457200" y="457200"/>') !== -1, 'expected child relative off 457200,457200; got: ' + inner)
		},
	},
	{
		name: 'addGroup supports a child text run nested in the group',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				const g = slide.addGroup({ x: 0.5, y: 0.5, w: 6, h: 3 })
				g.addText('Grouped Label', { x: 0.1, y: 0.2, w: 3, h: 1, color: 'FFFFFF' })
			})
			const inner = xml.substring(xml.indexOf('<p:grpSp>'), xml.indexOf('</p:grpSp>'))
			assert(inner.indexOf('<a:t>Grouped Label</a:t>') !== -1, 'expected grouped text nested inside group; got: ' + inner)
		},
	},
]
