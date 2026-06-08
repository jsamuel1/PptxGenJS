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
		name: 'addSmartArt: packages 5 diagram parts + graphicFrame + 4 <dgm:relIds> + Content_Types overrides',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addSmartArt({ x: 1, y: 1, w: 10, h: 3, layout: 'process', items: ['Discover', 'Build', 'Ship'] })
			})
			;['data1-1', 'layout1-1', 'quickStyle1-1', 'colors1-1', 'drawing1-1'].forEach(n => {
				assert(parts.names.includes(`ppt/diagrams/${n}.xml`), `diagram part ppt/diagrams/${n}.xml missing`)
			})
			// graphicFrame with diagram graphicData + dgm:relIds carrying 4 r: ids
			assert(parts.slide1.indexOf('<p:graphicFrame>') !== -1, 'graphicFrame missing')
			assert(parts.slide1.indexOf('uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"') !== -1, 'diagram graphicData uri missing')
			const rel = parts.slide1.match(/<dgm:relIds[^>]*r:dm="(rId\d+)"[^>]*r:lo="(rId\d+)"[^>]*r:qs="(rId\d+)"[^>]*r:cs="(rId\d+)"/)
			assert(rel, 'dgm:relIds with r:dm/r:lo/r:qs/r:cs missing')
			// 5 Content_Types overrides (data/layout/style/colors/drawing)
			assert(parts.contentTypes.indexOf('PartName="/ppt/diagrams/data1-1.xml"') !== -1
				&& parts.contentTypes.indexOf('drawingml.diagramData+xml') !== -1, 'data Override missing')
			assert(parts.contentTypes.indexOf('drawingml.diagramLayout+xml') !== -1, 'layout Override missing')
			assert(parts.contentTypes.indexOf('drawingml.diagramStyle+xml') !== -1, 'style Override missing')
			assert(parts.contentTypes.indexOf('drawingml.diagramColors+xml') !== -1, 'colors Override missing')
			assert(parts.contentTypes.indexOf('PartName="/ppt/diagrams/drawing1-1.xml"') !== -1
				&& parts.contentTypes.indexOf('ms-office.drawingml.diagramDrawing+xml') !== -1, 'drawing Override missing')
		},
	},
	{
		name: 'addSmartArt: cross-entity id invariant — 4 relIds + drawing rId resolve to distinct unique slide rels of correct Types',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addSmartArt({ layout: 'process', items: ['A', 'B'] })
			})
			const m = parts.slide1.match(/<dgm:relIds[^>]*r:dm="(rId\d+)"[^>]*r:lo="(rId\d+)"[^>]*r:qs="(rId\d+)"[^>]*r:cs="(rId\d+)"/)
			assert(m, 'relIds not found')
			const [, dm, lo, qs, cs] = m
			const rels = parts.slide1Rels
			const typeOf = rid => {
				const re = new RegExp('<Relationship Id="' + rid + '" Type="([^"]+)"')
				const mm = rels.match(re)
				return mm ? mm[1] : null
			}
			assert(/relationships\/diagramData$/.test(typeOf(dm)), 'r:dm must resolve to a diagramData rel')
			assert(/relationships\/diagramLayout$/.test(typeOf(lo)), 'r:lo must resolve to a diagramLayout rel')
			assert(/relationships\/diagramQuickStyle$/.test(typeOf(qs)), 'r:qs must resolve to a diagramQuickStyle rel')
			assert(/relationships\/diagramColors$/.test(typeOf(cs)), 'r:cs must resolve to a diagramColors rel')
			// all 4 unique
			assert(new Set([dm, lo, qs, cs]).size === 4, '4 relIds must be distinct: ' + [dm, lo, qs, cs].join(','))
			// drawing rel present (5th) + dataModelExt relId points at it
			const drawRel = rels.match(/<Relationship Id="(rId\d+)" Type="[^"]*office\/2007\/relationships\/diagramDrawing" Target="\.\.\/diagrams\/drawing1-1\.xml"\//)
			assert(drawRel, 'drawing slide rel missing')
			const drawRid = drawRel[1]
			assert(![dm, lo, qs, cs].includes(drawRid), 'drawing rId must be distinct from the 4 relIds')
			const data1 = await parts.read('ppt/diagrams/data1-1.xml')
			assert(data1.indexOf(`relId="${drawRid}"`) !== -1, 'dataModelExt relId must equal the drawing slide rel rId; got ' + drawRid)
		},
	},
	{
		name: 'addSmartArt: data model point count == items+1 (doc); drawing sp count == items; modelIds match',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addSmartArt({ layout: 'list', items: ['One', 'Two', 'Three', 'Four'] })
			})
			const data1 = await parts.read('ppt/diagrams/data1-1.xml')
			const pts = data1.match(/<dgm:pt /g) || []
			assert(pts.length === 5, 'expected 5 <dgm:pt> (4 items + doc); got ' + pts.length)
			const cxns = data1.match(/<dgm:cxn /g) || []
			assert(cxns.length === 4, 'expected 4 connections (one per item); got ' + cxns.length)
			const drawing1 = await parts.read('ppt/diagrams/drawing1-1.xml')
			const sps = drawing1.match(/<dsp:sp /g) || []
			assert(sps.length === 4, 'expected 4 <dsp:sp> (one per item); got ' + sps.length)
			// node modelIds 1..4 appear in BOTH data and drawing
			;['1', '2', '3', '4'].forEach(mid => {
				assert(data1.indexOf(`modelId="${mid}"`) !== -1, 'data missing node modelId ' + mid)
				assert(drawing1.indexOf(`<dsp:sp modelId="${mid}">`) !== -1, 'drawing missing sp modelId ' + mid)
			})
			// item text present in both data and drawing
			assert(data1.indexOf('<a:t>Three</a:t>') !== -1 && drawing1.indexOf('<a:t>Three</a:t>') !== -1, 'item text missing')
		},
	},
	{
		name: 'addSmartArt: process lays out horizontally, list lays out vertically (drawing offsets differ)',
		fn: async () => {
			const proc = await buildParts(p => { p.addSlide().addSmartArt({ w: 10, h: 3, layout: 'process', items: ['A', 'B'] }) })
			const list = await buildParts(p => { p.addSlide().addSmartArt({ w: 10, h: 3, layout: 'list', items: ['A', 'B'] }) })
			const offs = xml => (xml.match(/<a:off x="(\d+)" y="(\d+)"\/>/g) || []).map(o => {
				const m = o.match(/x="(\d+)" y="(\d+)"/); return { x: +m[1], y: +m[2] }
			})
			const pOff = offs(await proc.read('ppt/diagrams/drawing1-1.xml'))
			const lOff = offs(await list.read('ppt/diagrams/drawing1-1.xml'))
			// process: boxes stay on one row (y constant), advance in x
			assert(pOff.length === 2, 'process expected 2 boxes')
			assert(pOff[0].y === pOff[1].y, 'process boxes should share the same y (single row)')
			assert(pOff[1].x > pOff[0].x, 'process second box should advance in x; got ' + JSON.stringify(pOff))
			// list: boxes stack in a column (x constant), advance in y
			assert(lOff.length === 2, 'list expected 2 boxes')
			assert(lOff[0].x === lOff[1].x, 'list boxes should share the same x (single column)')
			assert(lOff[1].y > lOff[0].y, 'list second box should advance in y; got ' + JSON.stringify(lOff))
		},
	},
	{
		name: 'addSmartArt: node fill color (default 4472C4, custom honored) in drawing cache',
		fn: async () => {
			const def = await buildParts(p => { p.addSlide().addSmartArt({ layout: 'process', items: ['A'] }) })
			const cust = await buildParts(p => { p.addSlide().addSmartArt({ layout: 'process', items: ['A'], color: '7C3AED' }) })
			assert((await def.read('ppt/diagrams/drawing1-1.xml')).indexOf('<a:srgbClr val="4472C4"/>') !== -1, 'default fill 4472C4 missing')
			assert((await cust.read('ppt/diagrams/drawing1-1.xml')).indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'custom fill 7C3AED missing')
		},
	},
	{
		name: 'addSmartArt: empty/invalid items or unknown layout → no-op (default-off preserved)',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				s.addSmartArt({ layout: 'process', items: [] })            // no items
				s.addSmartArt({ layout: 'list', items: [''] })             // only empty strings
				s.addSmartArt({ layout: 'circle', items: ['x'] })          // unknown layout
				s.addSmartArt(undefined)                                   // no props
			})
			assert(!parts.names.some(n => n.startsWith('ppt/diagrams/')), 'no diagram parts for degenerate input')
			assert(parts.slide1.indexOf('<dgm:relIds') === -1, 'no relIds for degenerate input')
			assert(parts.contentTypes.indexOf('diagramData+xml') === -1, 'no diagram Override for degenerate input')
		},
	},
	{
		name: 'addSmartArt: multiple diagrams across slides get distinct globally-indexed part files',
		fn: async () => {
			const parts = await buildParts(p => {
				p.addSlide().addSmartArt({ layout: 'process', items: ['A'] })
				p.addSlide().addSmartArt({ layout: 'list', items: ['B'] })
			})
			;['data1-1', 'drawing1-1', 'data2-1', 'drawing2-1'].forEach(n => {
				assert(parts.names.includes(`ppt/diagrams/${n}.xml`), `expected ppt/diagrams/${n}.xml`)
			})
			const slide2 = await parts.read('ppt/slides/slide2.xml')
			assert(slide2.indexOf('<dgm:relIds') !== -1, 'slide2 graphicFrame missing')
			const s2rels = await parts.read('ppt/slides/_rels/slide2.xml.rels')
			assert(s2rels.indexOf('../diagrams/data2-1.xml') !== -1, 'slide2 must reference data2.xml')
		},
	},
	{
		name: 'addSmartArt: default-off — a deck without addSmartArt emits NO diagram parts/rels/overrides/graphicFrame, and addSmartArt is chainable',
		fn: async () => {
			const parts = await buildParts(p => {
				const s = p.addSlide()
				const ret = s.addSmartArt({ layout: 'process', items: ['A'] })
				assert(ret === s, 'addSmartArt must return the slide (chainable)')
			})
			assert(parts.names.some(n => n.startsWith('ppt/diagrams/')), 'sanity: diagram deck should have diagram parts')
			const ctrl = await buildParts(p => { p.addSlide().addText('plain', { x: 1, y: 1 }) })
			assert(!ctrl.names.some(n => n.startsWith('ppt/diagrams/')), 'control deck must have no diagram parts')
			assert(ctrl.slide1.indexOf('<dgm:relIds') === -1, 'control deck must have no relIds')
			assert(ctrl.slide1Rels.indexOf('relationships/diagram') === -1, 'control deck must have no diagram rel')
			assert(ctrl.contentTypes.indexOf('diagramData+xml') === -1, 'control deck must have no diagram Override')
		},
	},
]
