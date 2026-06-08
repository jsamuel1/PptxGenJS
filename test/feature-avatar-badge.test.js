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
		name: 'addAvatar emits a filled ellipse + centred bold initials',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addAvatar({ x: 1, y: 1, size: 0.4, initials: 'JS', fill: '4B3F72' })
			})
			// exactly one ellipse, filled with the disc colour
			assert((xml.match(/prst="ellipse"/g) || []).length === 1, 'expected exactly 1 ellipse; got: ' + (xml.match(/prst="ellipse"/g) || []).length)
			assert(/prst="ellipse"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill><a:srgbClr val="4B3F72"\/>/.test(xml),
				'expected disc fill 4B3F72; got: ' + xml)
			// disc diameter = 0.4in = 365760 EMU (square)
			assert(xml.indexOf('<a:ext cx="365760" cy="365760"/>') !== -1, 'expected 0.4in square disc; got: ' + xml)
			// centred bold white initials, fontSize derived from size (0.4*72*0.4≈11.5 -> 12pt -> sz 1200)
			assert(xml.indexOf('<a:t>JS</a:t>') !== -1, 'expected initials JS; got: ' + xml)
			assert(/<a:rPr[^>]* b="1"/.test(xml), 'expected bold initials; got: ' + xml)
			assert(xml.indexOf('anchor="ctr"') !== -1, 'expected centred anchor; got: ' + xml)
			assert(xml.indexOf('algn="ctr"') !== -1, 'expected centred paragraph; got: ' + xml)
			assert(/<a:rPr[^>]* sz="1200"/.test(xml), 'expected derived sz="1200"; got: ' + xml)
			assert(xml.indexOf('<a:srgbClr val="FFFFFF"/>') !== -1, 'expected default white initials; got: ' + xml)
		},
	},
	{
		name: 'addAvatar honours explicit color/fontSize/fontFace',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addAvatar({ x: 1, y: 1, size: 0.5, initials: 'AB', fill: '224466', color: 'FFEE00', fontSize: 18, fontFace: 'Arial' })
			})
			assert(/<a:rPr[^>]* sz="1800"/.test(xml), 'expected explicit sz="1800"; got: ' + xml)
			assert(xml.indexOf('<a:srgbClr val="FFEE00"/>') !== -1, 'expected initials color FFEE00; got: ' + xml)
			assert(xml.indexOf('typeface="Arial"') !== -1, 'expected fontFace Arial; got: ' + xml)
		},
	},
	{
		name: 'addBadge pill: full-pill roundRect (adj 50000) sized to text + centred bold white label',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addBadge({ x: 2, y: 1, text: 'NEW', fill: '10B981' })
			})
			assert(xml.indexOf('prst="roundRect"') !== -1, 'expected roundRect; got: ' + xml)
			// full pill: adj = round((h/2) * EMU * 100000 / min(cx,cy)) = 50000 for a w>h pill
			assert(xml.indexOf('<a:gd name="adj" fmla="val 50000"/>') !== -1, 'expected full-pill adj 50000; got: ' + xml)
			assert(/prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"\/><\/a:avLst><\/a:prstGeom><a:solidFill><a:srgbClr val="10B981"\/>/.test(xml),
				'expected pill fill 10B981; got: ' + xml)
			assert(xml.indexOf('<a:t>NEW</a:t>') !== -1, 'expected label NEW; got: ' + xml)
			assert(/<a:rPr[^>]* b="1"/.test(xml), 'expected bold label; got: ' + xml)
			assert(/<a:rPr[^>]* sz="800"/.test(xml), 'expected default 8pt label; got: ' + xml)
			assert(xml.indexOf('anchor="ctr"') !== -1, 'expected centred anchor; got: ' + xml)
			// no ellipse for a pill
			assert((xml.match(/prst="ellipse"/g) || []).length === 0, 'pill must not emit an ellipse; got: ' + xml)
		},
	},
	{
		name: 'addBadge circle: emits a square ellipse (count bubble) + centred label',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addBadge({ x: 3, y: 1, text: '3', shape: 'circle', fill: '7C3AED' })
			})
			assert((xml.match(/prst="ellipse"/g) || []).length === 1, 'expected exactly 1 ellipse; got: ' + (xml.match(/prst="ellipse"/g) || []).length)
			assert(/prst="ellipse"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill><a:srgbClr val="7C3AED"\/>/.test(xml),
				'expected count-bubble fill 7C3AED; got: ' + xml)
			// circle must be square: cx === cy
			const ext = xml.match(/<a:ext cx="(\d+)" cy="(\d+)"\/>/)
			assert(ext && ext[1] === ext[2], 'expected a square (cx===cy) count bubble; got: ' + (ext && ext[0]))
			assert(xml.indexOf('<a:t>3</a:t>') !== -1, 'expected label 3; got: ' + xml)
			// no roundRect for a circle badge
			assert((xml.match(/prst="roundRect"/g) || []).length === 0, 'circle badge must not emit a roundRect; got: ' + xml)
		},
	},
	{
		name: 'addAvatar inside a group: composes into the group child array (grpSp holds ellipse + text)',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				const g = slide.addGroup({ x: 7, y: 1, w: 2, h: 0.5 })
				g.addAvatar({ x: 0, y: 0, size: 0.3, initials: 'AB', fill: '224466' })
				g.addBadge({ x: 1, y: 0, text: 'ON', fill: '10B981' })
			})
			// the group exists and the avatar/badge children are inside it
			const grp = xml.match(/<p:grpSp>[\s\S]*<\/p:grpSp>/)
			assert(grp, 'expected a <p:grpSp>; got: ' + xml)
			const grpXml = grp[0]
			// avatar ellipse + badge pill both inside the group
			assert(grpXml.indexOf('prst="ellipse"') !== -1, 'expected avatar ellipse inside group; got: ' + grpXml)
			assert(grpXml.indexOf('<a:srgbClr val="224466"/>') !== -1, 'expected avatar disc fill inside group; got: ' + grpXml)
			assert(grpXml.indexOf('<a:t>AB</a:t>') !== -1, 'expected avatar initials inside group; got: ' + grpXml)
			assert(grpXml.indexOf('prst="roundRect"') !== -1, 'expected badge pill inside group; got: ' + grpXml)
			assert(grpXml.indexOf('<a:t>ON</a:t>') !== -1, 'expected badge label inside group; got: ' + grpXml)
			// these are NOT also emitted at slide top-level (no duplicate outside the group)
			const topLevel = xml.replace(grpXml, '')
			assert(topLevel.indexOf('<a:t>AB</a:t>') === -1, 'avatar must be only inside the group; got: ' + topLevel)
		},
	},
	{
		name: 'addAvatar/addBadge edge cases: tiny/zero size, empty text/initials do not throw',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				// tiny/degenerate sizes and empty strings must clamp, not crash
				slide.addAvatar({ x: 0, y: 0, size: 0, initials: '' })
				slide.addBadge({ x: 1, y: 0, text: '', h: 0 })
				slide.addBadge({ x: 2, y: 0, text: 'X', shape: 'circle', w: 0, h: 0 })
			})
			// produced valid XML (some ellipse + roundRect present), no exception thrown
			assert(xml.indexOf('prst="ellipse"') !== -1, 'expected avatar disc rendered; got: ' + xml)
			assert(xml.indexOf('prst="roundRect"') !== -1, 'expected pill rendered; got: ' + xml)
			// avatar defaults applied (size 0 -> 0.4 disc, fill 4B3F72)
			assert(xml.indexOf('<a:srgbClr val="4B3F72"/>') !== -1, 'expected default avatar fill; got: ' + xml)
		},
	},
	{
		name: 'addAvatar/addBadge are chainable and return the Slide',
		fn: async () => {
			const pres = new PptxGenJS()
			const slide = pres.addSlide()
			const r1 = slide.addAvatar({ initials: 'JS' })
			const r2 = slide.addBadge({ text: 'NEW' })
			assert(r1 === slide, 'addAvatar should return the slide for chaining')
			assert(r2 === slide, 'addBadge should return the slide for chaining')
		},
	},
]
