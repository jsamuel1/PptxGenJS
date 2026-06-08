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
	{
		name: 'addCallout v2: accentBar + attribution emits a group with a filled accent rect, italic body, and muted attribution',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({
					x: 1, y: 5, w: 8, h: 1.2,
					text: 'The dispatcher is the game changer.',
					attribution: '— Internal power user feedback',
					fill: '1E1A2B', fontColor: 'D4D0DE', fontItalic: true, fontSize: 12, align: 'left',
					accentBar: { color: '7C3AED', width: 0.04 },
					attributionFont: { size: 9, color: '64748B' },
					padding: { l: 0.25, r: 0.2, t: 0.15, b: 0.15 },
				})
			})
			// v2 => a shape group
			assert(xml.indexOf('<p:grpSp>') !== -1, 'expected a group <p:grpSp>; got: ' + xml)
			// accent bar = the ONLY prst="rect" WITH a solid fill (text frames are prst="rect" + noFill)
			assert(/prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill><a:srgbClr val="7C3AED"\/><\/a:solidFill>/.test(xml),
				'expected a filled accent rect (7C3AED); got: ' + xml)
			// italic body run
			assert(/<a:rPr[^>]* i="1"/.test(xml), 'expected an italic body run (i="1"); got: ' + xml)
			// body + attribution text present
			assert(xml.indexOf('<a:t>The dispatcher is the game changer.</a:t>') !== -1, 'expected body text; got: ' + xml)
			assert(xml.indexOf('<a:t>— Internal power user feedback</a:t>') !== -1, 'expected attribution text; got: ' + xml)
			// attribution color + size (9pt => sz="900")
			assert(xml.indexOf('<a:srgbClr val="64748B"/>') !== -1, 'expected attribution color 64748B; got: ' + xml)
			assert(/<a:rPr[^>]* sz="900"/.test(xml), 'expected attribution sz="900" (9pt); got: ' + xml)
		},
	},
	{
		name: 'addCallout v2: gradient accent bar emits gradFill (not solidFill) on the accent rect',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({
					x: 1, y: 5, w: 8, h: 1, text: 'Gradient bar',
					accentBar: { color: { type: 'gradient', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }], direction: 90 } },
				})
			})
			assert(xml.indexOf('<p:grpSp>') !== -1, 'expected a group; got: ' + xml)
			// the accent rect carries a gradFill
			assert(/prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:gradFill/.test(xml),
				'expected gradient-filled accent rect (<a:gradFill>); got: ' + xml)
			assert(xml.indexOf('<a:srgbClr val="38BDF8"/>') !== -1, 'expected gradient stop 38BDF8; got: ' + xml)
		},
	},
	{
		name: 'addCallout v2: multi-run body renders both runs with the first bold',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({
					x: 1, y: 5, w: 8, h: 1,
					text: [{ text: 'Tip: ', options: { bold: true, color: 'A78BFA' } }, { text: 'pin critical chats.', options: {} }],
					accentBar: {},
				})
			})
			assert(xml.indexOf('<a:t>Tip: </a:t>') !== -1, 'expected first run text; got: ' + xml)
			assert(xml.indexOf('<a:t>pin critical chats.</a:t>') !== -1, 'expected second run text; got: ' + xml)
			// first run bold + accent color
			assert(/<a:rPr[^>]* b="1"[^>]*>\s*<a:solidFill><a:srgbClr val="A78BFA"/.test(xml),
				'expected first run bold with A78BFA color; got: ' + xml)
			// default accentBar {} => default 7C3AED filled rect
			assert(/prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill><a:srgbClr val="7C3AED"\/><\/a:solidFill>/.test(xml),
				'expected default-color (7C3AED) accent rect; got: ' + xml)
		},
	},
	{
		name: 'addCallout v2: bare accentBar:{} does not throw and emits a default-color bar',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({ text: 'x', accentBar: {} })
			})
			assert(/prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill><a:srgbClr val="7C3AED"\/><\/a:solidFill>/.test(xml),
				'expected default 7C3AED accent rect; got: ' + xml)
		},
	},
	{
		name: 'addCallout v1 default-off: no accentBar/attribution => single roundRect, centred, NO group and NO filled accent rect',
		fn: async () => {
			const xml = await buildSlideXml(slide => {
				slide.addCallout({ x: 1, y: 5, w: 8, h: 1, text: 'Hello', fill: '1E1A2B' })
			})
			// v1 must NOT produce a group or a filled accent rect
			assert(xml.indexOf('<p:grpSp>') === -1, 'v1 callout must not emit a group; got: ' + xml)
			assert(!/prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill>/.test(xml),
				'v1 callout must not emit a filled accent rect; got: ' + xml)
			// single roundRect with centred text (unchanged v1 structure)
			assert(xml.indexOf('prst="roundRect"') !== -1, 'expected roundRect; got: ' + xml)
			assert(xml.indexOf('anchor="ctr"') !== -1, 'expected centred anchor; got: ' + xml)
			assert(xml.indexOf('<a:t>Hello</a:t>') !== -1, 'expected callout text; got: ' + xml)
		},
	},
]
