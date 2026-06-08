
const JSZip = require('jszip')
const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { assert } = require('./helpers')

// Build a deck and return the key parts as strings.
async function buildParts(buildFn) {
	const pres = new PptxGenJS()
	buildFn(pres)
	const buf = await pres.stream()
	const zip = await JSZip.loadAsync(buf)
	const names = Object.keys(zip.files)
	const read = async p => {
		const e = zip.file(p)
		return e ? e.async('string') : null
	}
	return {
		names,
		presentation: await read('ppt/presentation.xml'),
		rels: await read('ppt/_rels/presentation.xml.rels'),
		contentTypes: await read('[Content_Types].xml'),
		handout: await read('ppt/handoutMasters/handoutMaster1.xml'),
		handoutRels: await read('ppt/handoutMasters/_rels/handoutMaster1.xml.rels'),
	}
}

module.exports = [
	{
		name: 'defineHandoutMaster: writes part + rels + Content_Types Override + idLst',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addText('a', { x: 1, y: 1 })
				p.defineHandoutMaster({ background: 'FFFFFF' })
			})
			assert(parts.names.includes('ppt/handoutMasters/handoutMaster1.xml'), 'handoutMaster1.xml part missing')
			assert(parts.names.includes('ppt/handoutMasters/_rels/handoutMaster1.xml.rels'), 'handout rels missing')
			assert(parts.contentTypes.indexOf('PartName="/ppt/handoutMasters/handoutMaster1.xml"') !== -1
				&& parts.contentTypes.indexOf('presentationml.handoutMaster+xml') !== -1, 'Content_Types Override missing')
			assert(parts.presentation.indexOf('<p:handoutMasterIdLst>') !== -1, '<p:handoutMasterIdLst> missing')
			// handout rels references the shared theme2.xml
			assert(parts.handoutRels.indexOf('Target="../theme/theme2.xml"') !== -1, 'handout rels theme target missing')
		},
	},
	{
		name: 'defineHandoutMaster: idLst emitted AFTER notesMasterIdLst and BEFORE sldIdLst (CT_Presentation order)',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide()
				p.defineHandoutMaster({})
			})
			const idxNotes = parts.presentation.indexOf('</p:notesMasterIdLst>')
			const idxHandout = parts.presentation.indexOf('<p:handoutMasterIdLst>')
			const idxSld = parts.presentation.indexOf('<p:sldIdLst>')
			assert(idxNotes !== -1 && idxHandout !== -1 && idxSld !== -1, 'one of the idLst elements is missing')
			assert(idxNotes < idxHandout, 'handoutMasterIdLst must come after notesMasterIdLst')
			assert(idxHandout < idxSld, 'handoutMasterIdLst must come before sldIdLst')
		},
	},
	{
		name: 'defineHandoutMaster: handoutMasterId r:id resolves to a unique handoutMaster Relationship',
		fn: async () => {
			// 3 slides, no fonts/comments → next free rId after fixed rels is N+7 = 10
			const parts = await buildParts(p => {
				p.addSlide(); p.addSlide(); p.addSlide()
				p.defineHandoutMaster({})
			})
			const m = parts.presentation.match(/<p:handoutMasterId r:id="(rId\d+)"\/>/)
			assert(m, 'handoutMasterId element not found')
			const rid = m[1]
			assert(rid === 'rId10', 'expected rId10 for a 3-slide deck; got ' + rid)
			// rel resolves
			const relRe = new RegExp('<Relationship Id="' + rid + '" Type="[^"]*relationships/handoutMaster" Target="handoutMasters/handoutMaster1.xml"/>')
			assert(relRe.test(parts.rels), 'handoutMaster rel for ' + rid + ' not found; rels: ' + parts.rels)
			// id is unique in the rels part
			const occurrences = (parts.rels.match(new RegExp('Id="' + rid + '"', 'g')) || []).length
			assert(occurrences === 1, 'expected exactly 1 Relationship with ' + rid + '; got ' + occurrences)
		},
	},
	{
		name: 'defineHandoutMaster: headerFooter sets <p:hf> flags and header/footer text',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide()
				p.defineHandoutMaster({ headerFooter: { header: 'Internal', footer: 'Confidential', dateTime: true, slideNumber: true } })
			})
			assert(parts.handout.indexOf('<p:hf sldNum="1" hdr="1" ftr="1" dt="1"/>') !== -1, 'hf flags wrong; got: ' + parts.handout)
			assert(parts.handout.indexOf('<a:t>Internal</a:t>') !== -1, 'header text missing')
			assert(parts.handout.indexOf('<a:t>Confidential</a:t>') !== -1, 'footer text missing')
			// clrMap present (cSld, clrMap, hf order)
			assert(parts.handout.indexOf('<p:clrMap ') !== -1, 'clrMap missing')
			const idxClrMap = parts.handout.indexOf('</p:clrMap>')
			// hf is self-closing <p:hf .../>, so locate via the open tag and ensure it follows clrMap close... clrMap is self-closing
			const idxClrMapTag = parts.handout.indexOf('<p:clrMap ')
			const idxHf = parts.handout.indexOf('<p:hf ')
			assert(idxClrMapTag !== -1 && idxHf > idxClrMapTag, 'hf must follow clrMap')
		},
	},
	{
		name: 'defineHandoutMaster: background hex emits srgbClr solid fill; omitted → theme bgRef',
		fn: async () => {
			const withBg = await buildParts(p => { p.addSlide(); p.defineHandoutMaster({ background: 'FF8800' }) })
			assert(withBg.handout.indexOf('<a:srgbClr val="FF8800"/>') !== -1, 'background srgbClr missing')

			const noBg = await buildParts(p => { p.addSlide(); p.defineHandoutMaster({}) })
			assert(noBg.handout.indexOf('<p:bgRef idx="1001">') !== -1, 'default theme bgRef missing')
			assert(noBg.handout.indexOf('<a:srgbClr') === -1, 'no srgbClr expected when background omitted')
		},
	},
	{
		name: 'defineHandoutMaster: default-off — no part / idLst / Override / rel when never called',
		fn: async () => {
			const parts = await buildParts(p => { p.addSlide().addText('x', { x: 1, y: 1 }) })
			assert(!parts.names.includes('ppt/handoutMasters/handoutMaster1.xml'), 'unexpected handout part')
			assert(parts.presentation.indexOf('handoutMasterIdLst') === -1, 'unexpected handoutMasterIdLst')
			assert(parts.contentTypes.indexOf('handoutMaster') === -1, 'unexpected handout Override')
			assert(parts.rels.indexOf('relationships/handoutMaster') === -1, 'unexpected handout rel')
		},
	},
	{
		name: 'defineHandoutMaster: invalid arg is a no-op (no crash, default-off preserved)',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide()
				// @ts-ignore deliberately invalid
				p.defineHandoutMaster(undefined)
			})
			assert(!parts.names.includes('ppt/handoutMasters/handoutMaster1.xml'), 'invalid arg should not create a handout part')
			assert(parts.presentation.indexOf('handoutMasterIdLst') === -1, 'invalid arg should not emit idLst')
		},
	},
]
