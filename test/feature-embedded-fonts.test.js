'use strict'

// Embedded fonts (docs/features/feature-embedded-fonts.md) — pptx.embedFont(...) packages
// /ppt/fonts/fontN.fntdata + rels + Content_Types, emits <p:embeddedFontLst> in
// canonical CT_Presentation order (after <p:notesSz>, before <p:custShowLst>), and
// sets embedTrueTypeFonts="1". Asserts emitted OOXML, rId consistency, part content,
// validation warnings (non-ttf skip), and the DEFAULT-OFF regression-catch.

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { build, readEntry, listEntries, assert } = require('./helpers')

// Tiny inline data-URI "fonts" (content is irrelevant to OOXML schema; only the
// part/rel/Content_Types wiring is validated). `QUJD` is base64 for "ABC".
const TTF_REGULAR = 'data:font/ttf;base64,QUJD'        // -> QUJD
const TTF_BOLD = 'data:font/ttf;base64,REVG'           // -> REVG ("DEF")
const TTF_ITALIC = 'data:font/otf;base64,R0hJ'         // -> R0hI ("GHI")

module.exports = [
	{
		name: 'embedded-fonts: single regular face → embeddedFontLst + embedTrueTypeFonts + part + rel + Content_Types',
		fn: async () => {
			const { zip } = await build(p => {
				p.embedFont({ family: 'Inter', regular: TTF_REGULAR })
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			const relsXml = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			const ctXml = await readEntry(zip, '[Content_Types].xml')

			// presentation attribute
			assert(/embedTrueTypeFonts="1"/.test(presXml), 'expected embedTrueTypeFonts="1" on <p:presentation>')
			// 1 slide → font rels start at slides.length + 7 = rId8
			assert(
				presXml.includes('<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter"/><p:regular r:id="rId8"/></p:embeddedFont></p:embeddedFontLst>'),
				'expected single-face embeddedFontLst with rId8; got: ' + presXml
			)
			// child-order: after <p:notesSz/>, before <p:custShowLst>/<p:defaultTextStyle>
			assert(/<p:notesSz [^>]*\/><p:embeddedFontLst>/.test(presXml), 'embeddedFontLst must come right after <p:notesSz>')
			assert(presXml.indexOf('<p:embeddedFontLst>') < presXml.indexOf('<p:defaultTextStyle>'), 'embeddedFontLst must come before <p:defaultTextStyle>')
			// rel target + type
			assert(
				relsXml.includes('<Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.fntdata"/>'),
				'expected font rId8 → fonts/font1.fntdata; got: ' + relsXml
			)
			// Content_Types Default
			assert(ctXml.includes('<Default Extension="fntdata" ContentType="application/x-fontdata"/>'), 'expected fntdata Default in Content_Types')
			// part exists and content matches the base64 payload
			assert(listEntries(zip).includes('ppt/fonts/font1.fntdata'), 'expected ppt/fonts/font1.fntdata part')
			const partBuf = await zip.file('ppt/fonts/font1.fntdata').async('nodebuffer')
			assert(partBuf.toString('utf8') === 'ABC', 'expected font1.fntdata decoded bytes "ABC"; got: ' + partBuf.toString('utf8'))
		}
	},
	{
		name: 'embedded-fonts: multi-face (regular+bold+italic) → sequential rIds + 3 parts',
		fn: async () => {
			const { zip } = await build(p => {
				p.embedFont({ family: 'Inter', regular: TTF_REGULAR, bold: TTF_BOLD, italic: TTF_ITALIC })
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			assert(
				presXml.includes('<p:embeddedFont><p:font typeface="Inter"/><p:regular r:id="rId8"/><p:bold r:id="rId9"/><p:italic r:id="rId10"/></p:embeddedFont>'),
				'expected sequential rId8/9/10 for regular/bold/italic; got: ' + presXml
			)
			const entries = listEntries(zip)
			assert(entries.includes('ppt/fonts/font1.fntdata'), 'expected font1.fntdata')
			assert(entries.includes('ppt/fonts/font2.fntdata'), 'expected font2.fntdata')
			assert(entries.includes('ppt/fonts/font3.fntdata'), 'expected font3.fntdata')
		}
	},
	{
		name: 'embedded-fonts: multiple families → continuous rId numbering across families',
		fn: async () => {
			const { zip } = await build(p => {
				p.embedFont({ family: 'Inter', regular: TTF_REGULAR, bold: TTF_BOLD })
				p.embedFont({ family: 'Roboto', regular: TTF_ITALIC })
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			assert(presXml.includes('<p:font typeface="Inter"/><p:regular r:id="rId8"/><p:bold r:id="rId9"/>'), 'Inter faces rId8/9')
			assert(presXml.includes('<p:font typeface="Roboto"/><p:regular r:id="rId10"/>'), 'Roboto regular rId10')
			assert(listEntries(zip).includes('ppt/fonts/font3.fntdata'), 'expected 3 font parts')
		}
	},
	{
		name: 'embedded-fonts: non-ttf/otf face is skipped (regular kept, bad bold dropped)',
		fn: async () => {
			const { zip } = await build(p => {
				p.embedFont({ family: 'Inter', regular: TTF_REGULAR, bold: './Inter-Bold.woff2' })
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			assert(presXml.includes('<p:regular r:id="rId8"/></p:embeddedFont>'), 'bad bold face must be dropped, leaving only regular; got: ' + presXml)
			assert(!/<p:bold /.test(presXml), 'unsupported .woff2 bold must NOT be emitted')
			assert(!listEntries(zip).includes('ppt/fonts/font2.fntdata'), 'no second font part for dropped face')
		}
	},
	{
		name: 'embedded-fonts: font with invalid regular is rejected entirely (default-off preserved)',
		fn: async () => {
			const { zip } = await build(p => {
				p.embedFont({ family: 'Bad', regular: './Bad.woff' })
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			assert(!/<p:embeddedFontLst/.test(presXml), 'font with invalid regular must be skipped → no embeddedFontLst')
			assert(!/embedTrueTypeFonts/.test(presXml), 'no valid fonts → no embedTrueTypeFonts attr')
		}
	},
	{
		name: 'embedded-fonts: path-based face read from disk (Node) → part content matches file bytes',
		fn: async () => {
			const tmp = path.join(os.tmpdir(), `pptxgenjs-embed-${Date.now()}.ttf`)
			fs.writeFileSync(tmp, Buffer.from([0x00, 0x01, 0x02, 0x41, 0x42]))
			try {
				const { zip } = await build(p => {
					p.embedFont({ family: 'DiskFont', regular: tmp })
					p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
				})
				const partBuf = await zip.file('ppt/fonts/font1.fntdata').async('nodebuffer')
				assert(Buffer.compare(partBuf, Buffer.from([0x00, 0x01, 0x02, 0x41, 0x42])) === 0, 'disk font bytes must round-trip into the part')
			} finally {
				fs.unlinkSync(tmp)
			}
		}
	},
	{
		name: 'embedded-fonts: DEFAULT-OFF — no embedFont() → no list/attr/part/rel/Content_Types (regression-catch)',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			const relsXml = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			const ctXml = await readEntry(zip, '[Content_Types].xml')
			assert(!/<p:embeddedFontLst/.test(presXml), 'default: no <p:embeddedFontLst>')
			assert(!/embedTrueTypeFonts/.test(presXml), 'default: no embedTrueTypeFonts attr')
			// exact attribute string must be byte-identical to the historical default
			assert(presXml.includes('xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"  saveSubsetFonts="1" autoCompressPictures="0">'), 'default: presentation tag must be byte-identical (no extra attr/space)')
			assert(!/relationships\/font/.test(relsXml), 'default: no font relationships')
			assert(!/Extension="fntdata"/.test(ctXml), 'default: no fntdata Content_Types Default')
			assert(!listEntries(zip).some(e => e.startsWith('ppt/fonts/')), 'default: no ppt/fonts/* parts')
		}
	}
]
