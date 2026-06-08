
const JSZip = require('jszip')
const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { assert } = require('./helpers')

// Build a deck via the SHIPPED bundle and return the key parts as strings.
async function buildParts(buildFn) {
	const pres = new PptxGenJS()
	buildFn(pres)
	const buf = await pres.stream()
	const zip = await JSZip.loadAsync(buf)
	const names = Object.keys(zip.files).filter(n => !zip.files[n].dir)
	const read = async p => {
		const e = zip.file(p)
		return e ? e.async('string') : null
	}
	return {
		names,
		slide1: await read('ppt/slides/slide1.xml'),
		slide1Rels: await read('ppt/slides/_rels/slide1.xml.rels'),
		contentTypes: await read('[Content_Types].xml'),
		read,
	}
}

module.exports = [
	{
		name: 'addInk: packages an InkML part + slide rel + Content_Types Override + <p:contentPart>',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addInk({ strokes: [[[1, 1], [1.2, 0.9], [1.5, 1.1]]], color: '7C3AED', width: 2 })
			})
			assert(parts.names.includes('ppt/ink/ink-1-1.xml'), 'ink part ppt/ink/ink-1-1.xml missing')
			// contentPart present in slide spTree
			const cps = parts.slide1.match(/<p:contentPart r:id="rId\d+"\/>/g) || []
			assert(cps.length === 1, 'expected exactly 1 <p:contentPart>; got ' + cps.length)
			// slide rel of customXml type targeting the ink part
			assert(/<Relationship Id="rId\d+" Type="[^"]*relationships\/customXml" Target="\.\.\/ink\/ink-1-1\.xml"\/>/.test(parts.slide1Rels),
				'ink slide relationship missing/incorrect')
			// Content_Types Override
			assert(parts.contentTypes.indexOf('PartName="/ppt/ink/ink-1-1.xml"') !== -1
				&& parts.contentTypes.indexOf('application/inkml+xml') !== -1, 'ink Content_Types Override missing')
		},
	},
	{
		name: 'addInk: cross-entity id invariant — contentPart r:id resolves to the ink rel rId (unique)',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addInk({ strokes: [[[0, 0], [1, 1]]] })
			})
			const cp = parts.slide1.match(/<p:contentPart r:id="(rId\d+)"\/>/)
			assert(cp, 'contentPart not found')
			const rid = cp[1]
			// the same rId must appear as a customXml Relationship targeting an ink part
			const relRe = new RegExp('<Relationship Id="' + rid + '" Type="[^"]*relationships/customXml" Target="\\.\\./ink/[^"]+"/>')
			assert(relRe.test(parts.slide1Rels), 'contentPart r:id ' + rid + ' does not resolve to an ink rel')
			// and that rId is unique in the slide rels
			const occ = (parts.slide1Rels.match(new RegExp('Id="' + rid + '"', 'g')) || []).length
			assert(occ === 1, 'ink rId ' + rid + ' must be unique in slide rels; found ' + occ)
		},
	},
	{
		name: 'addInk: one <inkml:trace> per stroke; points are inches→EMU',
		fn: async () => {
			const parts = await buildParts(p => {
				// 3 strokes; first stroke at (1,1) -> EMU 914400 914400
				p.addSlide().addInk({ strokes: [[[1, 1], [2, 2]], [[3, 3]], [[0.5, 0.5], [0.5, 1]]] })
			})
			const ink = await parts.read('ppt/ink/ink-1-1.xml')
			const traces = ink.match(/<inkml:trace[^>]*>/g) || []
			assert(traces.length === 3, 'expected 3 <inkml:trace>; got ' + traces.length)
			// inch→EMU: 1in = 914400 EMU
			assert(ink.indexOf('914400 914400') !== -1, 'expected first point at 914400 914400 EMU')
			assert(ink.indexOf('xmlns:inkml="http://www.w3.org/2003/InkML"') !== -1, 'InkML namespace missing')
		},
	},
	{
		name: 'addInk: color + width emitted on the brush (defaults 000000 / 1pt)',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				s.addInk({ strokes: [[[1, 1]]], color: 'FF0000', width: 3 }) // 3pt -> 38100 EMU
				s.addInk({ strokes: [[[2, 2]]] })                            // defaults
			})
			const ink1 = await parts.read('ppt/ink/ink-1-1.xml')
			const ink2 = await parts.read('ppt/ink/ink-1-2.xml')
			assert(ink1.indexOf('value="#FF0000"') !== -1, 'custom color missing')
			assert(ink1.indexOf('name="width" value="38100"') !== -1, 'custom width (3pt=38100 EMU) missing')
			assert(ink2.indexOf('value="#000000"') !== -1, 'default color 000000 missing')
			assert(ink2.indexOf('name="width" value="12700"') !== -1, 'default width (1pt=12700 EMU) missing')
		},
	},
	{
		name: 'addInk: multiple inks on a slide each get a unique part + rId + contentPart',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				s.addInk({ strokes: [[[1, 1]]] })
				s.addInk({ strokes: [[[2, 2]]] })
				s.addInk({ strokes: [[[3, 3]]] })
			})
			assert(parts.names.includes('ppt/ink/ink-1-1.xml')
				&& parts.names.includes('ppt/ink/ink-1-2.xml')
				&& parts.names.includes('ppt/ink/ink-1-3.xml'), 'expected 3 distinct ink parts')
			const cps = parts.slide1.match(/<p:contentPart r:id="(rId\d+)"\/>/g) || []
			assert(cps.length === 3, 'expected 3 contentParts; got ' + cps.length)
			const rids = cps.map(c => c.match(/rId\d+/)[0])
			assert(new Set(rids).size === 3, 'contentPart rIds must be distinct: ' + rids.join(','))
		},
	},
	{
		name: 'addInk: DOUBLE-EMIT GUARD — slide with BOTH ink and a group emits exactly ONE contentPart per ink',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				const g = s.addGroup({ x: 1, y: 1, w: 3, h: 3 })
				g.addShape('rect', { x: 0, y: 0, w: 1, h: 1, fill: { color: '00FF00' } })
				g.addText('grp', { x: 0, y: 1, w: 2, h: 0.5 })
				s.addInk({ strokes: [[[1, 1], [2, 2]]] })
			})
			const cps = parts.slide1.match(/<p:contentPart/g) || []
			assert(cps.length === 1, 'group-reuse double-emit: expected exactly 1 <p:contentPart>; got ' + cps.length)
			// the group is still present (guard did not suppress real group markup)
			assert(parts.slide1.indexOf('<p:grpSp>') !== -1, 'group markup missing — guard over-suppressed')
		},
	},
	{
		name: 'addInk: empty/invalid strokes are a no-op (default-off preserved)',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				s.addInk({ strokes: [] })                          // no strokes
				s.addInk({ strokes: [[]] })                        // empty stroke
				s.addInk({ strokes: [[[NaN, 1], ['x', 'y']]] })    // no finite points
				s.addInk(undefined)                                // no props
			})
			assert(!parts.names.some(n => n.startsWith('ppt/ink/')), 'no ink parts should be written for degenerate input')
			assert((parts.slide1.match(/<p:contentPart/g) || []).length === 0, 'no contentPart for degenerate input')
			assert(parts.contentTypes.indexOf('application/inkml+xml') === -1, 'no ink Override for degenerate input')
		},
	},
	{
		name: 'addInk: default-off — a deck without addInk emits NO ink part/rel/Override/contentPart, and addInk is chainable',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				const ret = s.addInk({ strokes: [[[1, 1]]] })
				assert(ret === s, 'addInk must return the slide (chainable)')
			})
			// control deck
			const ctrl = await buildParts(p => { p.addSlide().addText('plain', { x: 1, y: 1 }) })
			assert(!ctrl.names.some(n => n.startsWith('ppt/ink/')), 'control deck must have no ink parts')
			assert((ctrl.slide1.match(/<p:contentPart/g) || []).length === 0, 'control deck must have no contentPart')
			assert(ctrl.slide1Rels.indexOf('relationships/customXml') === -1, 'control deck must have no ink rel')
			assert(ctrl.contentTypes.indexOf('application/inkml+xml') === -1, 'control deck must have no ink Override')
		},
	},
]
