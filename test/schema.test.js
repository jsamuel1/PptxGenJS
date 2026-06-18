'use strict'

// Schema-validation fixtures. Each case builds a representative `.pptx`
// and asserts the OpenXmlValidator (via OOXMLValidatorCLI) reports no
// errors.
//
// Fixtures are intentionally small and orthogonal — they exercise one
// API surface each — so when an error appears we can localise it.
//
// Run with: npm run schema-test

const { build, assert, readEntry, listEntries } = require('./helpers')
const { validateBuf } = require('./validator')
const { parseSvg } = require('../src/bld/utils.cjs.js')

async function expectNoSchemaErrors (buf, label) {
	const errors = await validateBuf(buf)
	if (errors.length === 0) return
	const summary = errors
		.slice(0, 5)
		.map(e => `  - [${e.ErrorType}] ${e.Description} (path: ${(e.Path && e.Path.PartUri) || '?'})`)
		.join('\n')
	const more = errors.length > 5 ? `\n  ...(${errors.length - 5} more)` : ''
	assert(
		false,
		`${label}: ${errors.length} schema error(s):\n${summary}${more}`
	)
}

module.exports = [
	{
		name: 'smartart diagrams (addSmartArt -> 5 dgm/dsp parts + graphicFrame + dgm:relIds + 5 slide rels + Overrides)',
		fn: async () => {
			// Slide 1: a process diagram (3 items). Slide 2: a list diagram (2 items). Slide 3: no diagram (default-off control).
			const { buf, zip } = await build(p => {
				p.addSlide().addSmartArt({ x: 1, y: 1, w: 10, h: 3, layout: 'process', items: ['Discover', 'Build', 'Ship'], color: '7C3AED' })
				p.addSlide().addSmartArt({ x: 0.5, y: 0.5, w: 4, h: 5, layout: 'list', items: ['Alpha', 'Beta'] })
				p.addSlide().addText('plain', { x: 1, y: 1, w: 3, h: 1 })
			})
			// Baseline: the whole package validates clean (5 dgm/dsp parts + graphicFrame).
			await expectNoSchemaErrors(buf, 'smartart')

			const slide1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			const rels1 = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			const slide3 = await readEntry(zip, 'ppt/slides/slide3.xml')
			const ct = await readEntry(zip, '[Content_Types].xml')

			// (i) all 5 diagram parts exist + parse for slide 1.
			;['data1-1', 'layout1-1', 'quickStyle1-1', 'colors1-1', 'drawing1-1'].forEach(n => {
				assert(zip.file('ppt/diagrams/' + n + '.xml'), 'smartart: part ppt/diagrams/' + n + '.xml missing')
			})

			// (ii) cross-entity invariant ×5 — the four <dgm:relIds> r: ids + the drawing rId each resolve
			// to a DISTINCT UNIQUE slide rel of the correct Type. The XSD WILL catch a dangling r:dm/r:lo/
			// r:qs/r:cs (they are r:id-typed) — see the regression-catch below.
			const m = slide1.match(/<dgm:relIds[^>]*r:dm="(rId\d+)"[^>]*r:lo="(rId\d+)"[^>]*r:qs="(rId\d+)"[^>]*r:cs="(rId\d+)"/)
			assert(m, 'smartart: <dgm:relIds> with 4 r: ids missing')
			const [, dm, lo, qs, cs] = m
			const typeOf = rid => {
				const mm = rels1.match(new RegExp('<Relationship Id="' + rid + '" Type="([^"]+)"'))
				return mm ? mm[1] : null
			}
			assert(/relationships\/diagramData$/.test(typeOf(dm)), 'smartart: r:dm must resolve to diagramData rel')
			assert(/relationships\/diagramLayout$/.test(typeOf(lo)), 'smartart: r:lo must resolve to diagramLayout rel')
			assert(/relationships\/diagramQuickStyle$/.test(typeOf(qs)), 'smartart: r:qs must resolve to diagramQuickStyle rel')
			assert(/relationships\/diagramColors$/.test(typeOf(cs)), 'smartart: r:cs must resolve to diagramColors rel')
			const drawRel = rels1.match(/<Relationship Id="(rId\d+)" Type="[^"]*office\/2007\/relationships\/diagramDrawing" Target="\.\.\/diagrams\/drawing1-1\.xml"\//)
			assert(drawRel, 'smartart: drawing slide rel (5th) missing')
			const ids = [dm, lo, qs, cs, drawRel[1]]
			assert(new Set(ids).size === 5, 'smartart: the 4 relIds + drawing rId must be 5 distinct ids: ' + ids.join(','))
			// each id unique within the rels part
			ids.forEach(rid => assert((rels1.match(new RegExp('Id="' + rid + '"', 'g')) || []).length === 1, 'smartart: rId ' + rid + ' must be unique'))

			// (iii) dataModelExt relId == the drawing slide rel rId (renders out-of-the-box via the cache).
			const data1 = await readEntry(zip, 'ppt/diagrams/data1-1.xml')
			assert(data1.indexOf('relId="' + drawRel[1] + '"') !== -1, 'smartart: dataModelExt relId must equal the drawing rId ' + drawRel[1])

			// (iv) data-model point count == items+1 (doc); drawing sp count == items; modelIds align.
			assert((data1.match(/<dgm:pt /g) || []).length === 4, 'smartart: data1 should have 4 <dgm:pt> (3 items + doc)')
			const drawing1 = await readEntry(zip, 'ppt/diagrams/drawing1-1.xml')
			assert((drawing1.match(/<dsp:sp /g) || []).length === 3, 'smartart: drawing1 should have 3 <dsp:sp>')
			assert(drawing1.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'smartart: custom node fill missing in drawing cache')

			// (v) 5 Content_Types Overrides for slide 1's diagram.
			;[['data1-1', 'diagramData'], ['layout1-1', 'diagramLayout'], ['quickStyle1-1', 'diagramStyle'], ['colors1-1', 'diagramColors']].forEach(([n, t]) => {
				assert(ct.indexOf('PartName="/ppt/diagrams/' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.' + t + '+xml"') !== -1, 'smartart: Override for ' + n + ' missing')
			})
			assert(ct.indexOf('PartName="/ppt/diagrams/drawing1-1.xml" ContentType="application/vnd.ms-office.drawingml.diagramDrawing+xml"') !== -1, 'smartart: drawing Override missing')

			// DEFAULT-OFF: slide 3 has no graphicFrame/relIds; a deck with NO addSmartArt has no diagram parts at all.
			assert(slide3.indexOf('<dgm:relIds') === -1, 'smartart: default-off slide must have no relIds')
			const { zip: zipNo } = await build(p => { p.addSlide().addText('x', { x: 1, y: 1 }) })
			assert(!Object.keys(zipNo.files).some(n => n.startsWith('ppt/diagrams/')), 'smartart: default-off deck must have no diagram parts')
			const ctNo = await readEntry(zipNo, '[Content_Types].xml')
			assert(ctNo.indexOf('drawingml.diagramData+xml') === -1, 'smartart: default-off deck must have no diagram Override')

			// Validator regression-catch: prove the validator is engaged — corrupt r:dm to a dangling rId
			// and confirm schema errors surface (r:dm is an r:id-typed attribute).
			const badSlide1 = slide1.replace(/r:dm="rId\d+"/, 'r:dm="rId9999"')
			assert(badSlide1 !== slide1, 'smartart: mutation precondition')
			zip.file('ppt/slides/slide1.xml', badSlide1)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'smartart: validator should flag a dangling <dgm:relIds> r:dm (regression-catch)')
		}
	},
	{
		name: 'ink annotations (addInk -> InkML part + customXml rel + contentPart + Override)',
		fn: async () => {
			// Slide 1 has TWO inks AND a group (double-emit guard); slide 2 has none (default-off control).
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addText('hi', { x: 1, y: 1, w: 3, h: 1 })
				const g = s.addGroup({ x: 5, y: 1, w: 2, h: 2 })
				g.addShape('rect', { x: 0, y: 0, w: 1, h: 1, fill: { color: 'FF0000' } })
				s.addInk({ strokes: [[[1, 1], [1.2, 0.9], [1.5, 1.1]], [[2, 2], [2.3, 2.1]]], color: '7C3AED', width: 2 })
				s.addInk({ strokes: [[[3, 3], [3.5, 3.5]]] })
				p.addSlide().addText('plain', { x: 1, y: 1, w: 3, h: 1 })
			})
			// Baseline: the whole package validates clean (bare <p:contentPart> + InkML parts).
			await expectNoSchemaErrors(buf, 'ink')

			const slide1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			const rels1 = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			const slide2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			const ct = await readEntry(zip, '[Content_Types].xml')

			// (i) DOUBLE-EMIT GUARD: exactly TWO contentParts on the group+ink slide (one per addInk, not 4).
			const cps = slide1.match(/<p:contentPart r:id="(rId\d+)"\/>/g) || []
			assert(cps.length === 2, 'ink: expected exactly 2 <p:contentPart> on group+ink slide; got ' + cps.length)
			assert(slide1.indexOf('<p:grpSp>') !== -1, 'ink: group markup must still be present (guard over-suppressed)')

			// (ii) cross-entity invariant — each contentPart r:id resolves to a UNIQUE customXml ink rel
			// targeting an ink part (the XSD will NOT catch a dangling r:id since it is a plain string).
			cps.forEach(cp => {
				const rid = cp.match(/rId\d+/)[0]
				const relRe = new RegExp('<Relationship Id="' + rid + '" Type="[^"]*relationships/customXml" Target="\\.\\./ink/([^"]+)"/>')
				const m = rels1.match(relRe)
				assert(m, 'ink: contentPart r:id ' + rid + ' does not resolve to an ink rel')
				assert((rels1.match(new RegExp('Id="' + rid + '"', 'g')) || []).length === 1, 'ink: r:id ' + rid + ' must be unique in slide rels')
				// (iii) the referenced ink part exists, parses, and its <inkml:trace> count == strokes.length
				const inkXml = zip.file('ppt/ink/' + m[1])
				assert(inkXml, 'ink: part ppt/ink/' + m[1] + ' missing')
			})

			// (iii cont.) trace counts: first ink has 2 strokes, second has 1.
			const ink1 = await readEntry(zip, 'ppt/ink/ink-1-1.xml')
			const ink2 = await readEntry(zip, 'ppt/ink/ink-1-2.xml')
			assert((ink1.match(/<inkml:trace/g) || []).length === 2, 'ink: ink-1-1 should have 2 traces')
			assert((ink2.match(/<inkml:trace/g) || []).length === 1, 'ink: ink-1-2 should have 1 trace')
			assert(ink1.indexOf('value="#7C3AED"') !== -1, 'ink: custom color missing on brush')
			// inch->EMU: 1in = 914400 EMU
			assert(ink1.indexOf('914400 914400') !== -1, 'ink: first point should be 914400 914400 EMU')

			// (iv) Content_Types Overrides present for both ink parts.
			assert(ct.indexOf('PartName="/ppt/ink/ink-1-1.xml" ContentType="application/inkml+xml"') !== -1
				&& ct.indexOf('PartName="/ppt/ink/ink-1-2.xml" ContentType="application/inkml+xml"') !== -1,
				'ink: Content_Types Override(s) missing')

			// DEFAULT-OFF: slide 2 (no addInk) emits NO contentPart; and a deck without addInk has no ink at all.
			assert((slide2.match(/<p:contentPart/g) || []).length === 0, 'ink: default-off slide must have no contentPart')
			const { zip: zipNo } = await build(p => { p.addSlide().addText('x', { x: 1, y: 1 }) })
			const ctNo = await readEntry(zipNo, '[Content_Types].xml')
			const relsNo = await readEntry(zipNo, 'ppt/slides/_rels/slide1.xml.rels')
			assert(ctNo.indexOf('application/inkml+xml') === -1, 'ink: default-off deck must have no ink Override')
			assert(relsNo.indexOf('relationships/customXml') === -1, 'ink: default-off deck must have no ink rel')

			// Validator regression-catch: prove the validator is engaged — point the contentPart at a
			// non-existent relationship (dangling r:id) and confirm errors surface.
			const badSlide = slide1.replace(/<p:contentPart r:id="rId\d+"\/>/, '<p:contentPart r:id="rId9999"/>')
			assert(badSlide !== slide1, 'ink: mutation precondition')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'ink: validator should flag a dangling contentPart r:id (regression-catch)')
		}
	},
	{
		name: 'empty deck (one slide, no content)',
		fn: async () => {
			const { buf } = await build(p => { p.addSlide() })
			await expectNoSchemaErrors(buf, 'empty-deck')
		}
	},
	{
		name: 'single text box',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addText('hello', { x: 1, y: 1, w: 4, h: 0.5 })
			})
			await expectNoSchemaErrors(buf, 'single-text')
		}
	},
	{
		name: 'single rectangle shape',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
			})
			await expectNoSchemaErrors(buf, 'single-shape')
		}
	},
	{
		name: 'shape with shadow',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.15 }
				})
			})
			await expectNoSchemaErrors(buf, 'shape-with-shadow')
		}
	},
	{
		name: 'shape with reflection (a:reflection) — alone + combined canonical order + default-off',
		fn: async () => {
			const { buf, zip } = await build(p => {
				// slide1: reflection alone
				const s1 = p.addSlide()
				s1.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '7C3AED' },
					reflection: { blur: 0.5, distance: 0, size: 50, opacity: 50, fadeDirection: 90 }
				})
				// slide2: shadow + reflection + glow together (canonical CT_EffectList order)
				const s2 = p.addSlide()
				s2.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.15 },
					glow: { size: 5, color: 'FFFF00', opacity: 0.3 },
					reflection: { blur: 0.5, distance: 0, size: 40, opacity: 60, fadeDirection: 90 }
				})
				// slide3: no effects (default-off proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
			})

			// slide1: exact reflection emission (regression-catch on the converted attrs + fixed constants)
			const s1xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(
				/<a:reflection blurRad="6350" stA="50000" endA="300" endPos="50000" dist="0" dir="5400000" sy="-100000" rotWithShape="0"\/>/.test(s1xml),
				'reflection: expected <a:reflection blurRad="6350" stA="50000" endA="300" endPos="50000" dist="0" dir="5400000" sy="-100000" rotWithShape="0"/>'
			)

			// slide2: single effectLst with canonical child order glow < outerShdw < reflection (regression-catch for RI-15 reorder)
			const s2xml = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert((s2xml.match(/<a:effectLst>/g) || []).length === 1, 'combined: expected exactly one <a:effectLst>')
			const idxGlow = s2xml.indexOf('<a:glow')
			const idxShdw = s2xml.indexOf('<a:outerShdw')
			const idxRefl = s2xml.indexOf('<a:reflection')
			assert(idxGlow >= 0 && idxShdw >= 0 && idxRefl >= 0, 'combined: expected glow + outerShdw + reflection all present')
			assert(idxGlow < idxShdw && idxShdw < idxRefl, 'combined: expected canonical CT_EffectList order glow < outerShdw < reflection')

			// slide3: no reflection / no effectLst when no effects set (default-off)
			const s3xml = await readEntry(zip, 'ppt/slides/slide3.xml')
			assert(!/<a:reflection\b/.test(s3xml), 'default-off: plain shape must NOT emit <a:reflection>')
			assert(!/<a:effectLst>/.test(s3xml), 'default-off: plain shape must NOT emit <a:effectLst>')

			await expectNoSchemaErrors(buf, 'shape-reflection')
		}
	},
	{
		name: 'shape with soft edge (a:softEdge) — alone + combined canonical order + default-off + radius<=0 omit',
		fn: async () => {
			const { buf, zip } = await build(p => {
				// slide1: softEdge alone
				const s1 = p.addSlide()
				s1.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '7C3AED' },
					softEdge: { radius: 0.1 }
				})
				// slide2: shadow + glow + reflection + softEdge together (canonical CT_EffectList order)
				const s2 = p.addSlide()
				s2.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 2, fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', opacity: 0.15 },
					glow: { size: 5, color: 'FFFF00', opacity: 0.3 },
					reflection: { blur: 0.5, distance: 0, size: 40, opacity: 60, fadeDirection: 90 },
					softEdge: { radius: 0.05 }
				})
				// slide3: no effects (default-off proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
				// slide4: radius <= 0 (gate omit proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, softEdge: { radius: 0 } })
			})

			// slide1: exact softEdge emission (regression-catch on the inches→EMU conversion: 0.1 × 914400 = 91440)
			const s1xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(
				/<a:softEdge rad="91440"\/>/.test(s1xml),
				'softEdge: expected <a:softEdge rad="91440"/>'
			)

			// slide2: single effectLst, canonical child order glow < outerShdw < reflection < softEdge (softEdge-last regression-catch)
			const s2xml = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert((s2xml.match(/<a:effectLst>/g) || []).length === 1, 'combined: expected exactly one <a:effectLst>')
			const idxGlow = s2xml.indexOf('<a:glow')
			const idxShdw = s2xml.indexOf('<a:outerShdw')
			const idxRefl = s2xml.indexOf('<a:reflection')
			const idxSoft = s2xml.indexOf('<a:softEdge')
			assert(idxGlow >= 0 && idxShdw >= 0 && idxRefl >= 0 && idxSoft >= 0, 'combined: expected glow + outerShdw + reflection + softEdge all present')
			assert(idxGlow < idxShdw && idxShdw < idxRefl && idxRefl < idxSoft, 'combined: expected canonical CT_EffectList order glow < outerShdw < reflection < softEdge')

			// slide3: no softEdge / no effectLst when no effects set (default-off)
			const s3xml = await readEntry(zip, 'ppt/slides/slide3.xml')
			assert(!/<a:softEdge\b/.test(s3xml), 'default-off: plain shape must NOT emit <a:softEdge>')
			assert(!/<a:effectLst>/.test(s3xml), 'default-off: plain shape must NOT emit <a:effectLst>')

			// slide4: radius <= 0 omits the effect (and, as sole effect, no effectLst)
			const s4xml = await readEntry(zip, 'ppt/slides/slide4.xml')
			assert(!/<a:softEdge\b/.test(s4xml), 'radius<=0: must NOT emit <a:softEdge>')
			assert(!/<a:effectLst>/.test(s4xml), 'radius<=0: sole effect omitted must NOT emit <a:effectLst>')

			await expectNoSchemaErrors(buf, 'shape-softedge')
		}
	},
	{
		name: 'shape with 3-D bevel/extrusion (a:scene3d/a:sp3d) — full bevel exact-attr + scene3d-before-sp3d order + default-off + empty-bevel omit',
		fn: async () => {
			const { buf, zip } = await build(p => {
				// slide1: full bevel (top+bottom+depth+contour+material)
				const s1 = p.addSlide()
				s1.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 3, h: 2, fill: { color: '7C3AED' },
					bevel: {
						top: { preset: 'circle', width: 0.06, height: 0.06 },
						bottom: { preset: 'circle', width: 0.06, height: 0.06 },
						depth: { color: '5B21B6', amount: 0.08 },
						contour: { color: '000000', width: 0.01 },
						material: 'plastic'
					}
				})
				// slide2: no bevel (default-off proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' } })
				// slide3: empty bevel object (has-any-subfield gate omit proof)
				p.addSlide().addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, bevel: {} })
			})

			// slide1: exact 3-D emission (regression-catch on inches→EMU: 0.06×914400=54864, 0.08×914400=73152, 0.01×914400=9144)
			const s1xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(/<a:bevelT w="54864" h="54864" prst="circle"\/>/.test(s1xml), '3-D: expected <a:bevelT w="54864" h="54864" prst="circle"/>')
			assert(/<a:bevelB w="54864" h="54864" prst="circle"\/>/.test(s1xml), '3-D: expected <a:bevelB w="54864" h="54864" prst="circle"/>')
			assert(/extrusionH="73152"/.test(s1xml), '3-D: expected extrusionH="73152"')
			assert(/contourW="9144"/.test(s1xml), '3-D: expected contourW="9144"')
			assert(/prstMaterial="plastic"/.test(s1xml), '3-D: expected prstMaterial="plastic"')
			assert(/<a:extrusionClr><a:srgbClr val="5B21B6"\/><\/a:extrusionClr>/.test(s1xml), '3-D: expected <a:extrusionClr> child with srgbClr 5B21B6')
			assert(/<a:contourClr><a:srgbClr val="000000"\/><\/a:contourClr>/.test(s1xml), '3-D: expected <a:contourClr> child with srgbClr 000000')
			// canonical CT_ShapeProperties order: scene3d BEFORE sp3d (the order regression-catch)
			const idxScene3d = s1xml.indexOf('<a:scene3d>')
			const idxSp3d = s1xml.indexOf('<a:sp3d')
			assert(idxScene3d >= 0 && idxSp3d >= 0, '3-D: expected both <a:scene3d> and <a:sp3d>')
			assert(idxScene3d < idxSp3d, '3-D: expected canonical order <a:scene3d> BEFORE <a:sp3d>')
			// default scene rig
			assert(/<a:camera prst="orthographicFront"\/>/.test(s1xml), '3-D: expected default <a:camera prst="orthographicFront"/>')

			// slide2: no bevel → no scene3d/sp3d (default-off)
			const s2xml = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(!/<a:sp3d\b/.test(s2xml), 'default-off: plain shape must NOT emit <a:sp3d>')
			assert(!/<a:scene3d>/.test(s2xml), 'default-off: plain shape must NOT emit <a:scene3d>')

			// slide3: empty bevel object → omit everything (has-any-subfield gate)
			const s3xml = await readEntry(zip, 'ppt/slides/slide3.xml')
			assert(!/<a:sp3d\b/.test(s3xml), 'empty-bevel: bevel:{} must NOT emit <a:sp3d>')
			assert(!/<a:scene3d>/.test(s3xml), 'empty-bevel: bevel:{} must NOT emit <a:scene3d>')

			await expectNoSchemaErrors(buf, 'shape-3d')
		}
	},
	{
		name: 'solid-color slide background',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.background = { color: '0088CC' }
				s.addText('hi', { x: 1, y: 1 })
			})
			await expectNoSchemaErrors(buf, 'solid-bg')
		}
	},
	{
		name: 'bullet text',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addText('item', { x: 1, y: 1, w: 4, h: 0.5, bullet: true })
			})
			await expectNoSchemaErrors(buf, 'bullet-text')
		}
	},
	{
		name: 'simple table',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addTable(
					[
						[ { text: 'A1' }, { text: 'B1' } ],
						[ { text: 'A2' }, { text: 'B2' } ]
					],
					{ x: 1, y: 1, w: 4 }
				)
			})
			await expectNoSchemaErrors(buf, 'simple-table')
		}
	},
	{
		name: 'embedded PNG image',
		fn: async () => {
			const b64 =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const { buf } = await build(p => {
				p.addSlide().addImage({ data: 'image/png;base64,' + b64, x: 1, y: 1, w: 1, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'embedded-png')
		}
	},
	{
		name: 'gradient-fill shape (3-stop horizontal)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: {
						type: 'gradient', direction: 'horizontal',
						stops: [
							{ position: 0, color: '7C3AED' },
							{ position: 50, color: 'A78BFA' },
							{ position: 100, color: '38BDF8' }
						]
					}
				})
			})
			await expectNoSchemaErrors(buf, 'gradient-shape')
		}
	},
	{
		name: 'gradient-fill shape with per-stop transparency',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: {
						type: 'gradient', direction: 45,
						stops: [
							{ position: 0, color: '7C3AED', transparency: 40 },
							{ position: 100, color: '38BDF8' }
						]
					}
				})
			})
			await expectNoSchemaErrors(buf, 'gradient-shape-alpha')
		}
	},
	{
		name: 'slide with fade transition',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.transition = { type: 'fade', duration: 500 }
				s.addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'transition-fade')
		}
	},
	{
		name: 'slide with directional push transition',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.transition = { type: 'push', direction: 'left', duration: 750 }
				s.addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'transition-push')
		}
	},
	{
		name: 'slide with appear + fadeIn animations',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('title', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', duration: 420 } })
				s.addText('sub', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear', delay: 90 } })
			})
			await expectNoSchemaErrors(buf, 'animation-appear-fadein')
		}
	},
	{
		name: 'slide with staggered fadeIn animations',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', delay: 0 } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', delay: 90 } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn', delay: 180 } })
			})
			await expectNoSchemaErrors(buf, 'animation-staggered')
		}
	},
	{
		name: 'slide with flyIn animations (all four directions)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'left' } })
				s.addShape('rect', { x: 4, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'flyIn', direction: 'right' } })
				s.addShape('rect', { x: 1, y: 3, w: 2, h: 1, fill: { color: '0000FF' }, animation: { type: 'flyIn', direction: 'up', duration: 650 } })
				s.addShape('rect', { x: 4, y: 3, w: 2, h: 1, fill: { color: 'FFFF00' }, animation: { type: 'flyIn', direction: 'down' } })
			})
			await expectNoSchemaErrors(buf, 'animation-flyin')
		}
	},
	{
		name: 'slide with zoomIn animations',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'zoomIn' } })
				s.addText('zoom', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'zoomIn', duration: 720, delay: 90 } })
			})
			await expectNoSchemaErrors(buf, 'animation-zoomin')
		}
	},
	{
		name: 'slide with emphasis animations (spin/grow/colorPulse/pulse)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'spin', spinDegrees: 720 } })
				s.addShape('rect', { x: 4, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'grow', growScale: 2 } })
				s.addText('flash', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'colorPulse', color: 'FF00FF', duration: 600 } })
				s.addText('pulse', { x: 1, y: 4, w: 4, h: 1, animation: { type: 'pulse' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: emphasis members must carry presetClass="emph" (not the hardcoded "entr")
			assert(/presetClass="emph"/.test(xml), 'emphasis: expected presetClass="emph" in timing block')
			assert(!/presetClass="entr"/.test(xml), 'emphasis: must NOT emit presetClass="entr" for emphasis-only slide')
			// Each effect emits its distinguishing payload element
			assert(/<p:animRot by="43200000"/.test(xml), 'spin: expected <p:animRot by="43200000"> (720° × 60000)')
			assert(/<p:animScale><p:cBhvr>[\s\S]*?<p:by x="200000" y="200000"\/>/.test(xml), 'grow: expected <p:animScale> with <p:by x="200000" y="200000">')
			assert(/<p:animClr clrSpc="rgb">[\s\S]*?<p:to><a:srgbClr val="FF00FF"\/>/.test(xml), 'colorPulse: expected <p:animClr> with target srgbClr val="FF00FF"')
			assert(/<p:attrName>style.opacity<\/p:attrName>/.test(xml), 'pulse: expected <p:anim> on style.opacity')
			// Emphasis targets an already-visible object: no leading visibility <p:set>
			assert(!/<p:strVal val="visible"\/>/.test(xml), 'emphasis: must NOT emit the entrance visibility <p:set>')
			await expectNoSchemaErrors(buf, 'animation-emphasis')
		}
	},
	{
		name: 'slide with exit animations (disappear/fadeOut/flyOut/zoomOut)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'disappear' } })
				s.addText('fade', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeOut', duration: 600 } })
				s.addShape('rect', { x: 4, y: 1, w: 2, h: 1, fill: { color: '00FF00' }, animation: { type: 'flyOut', direction: 'right' } })
				s.addShape('rect', { x: 4, y: 3, w: 2, h: 1, fill: { color: '0000FF' }, animation: { type: 'zoomOut', duration: 720 } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: exit members must carry presetClass="exit" (not "entr"/"emph")
			assert(/presetClass="exit"/.test(xml), 'exit: expected presetClass="exit" in timing block')
			assert(!/presetClass="entr"/.test(xml), 'exit: must NOT emit presetClass="entr" for exit-only slide')
			assert(!/presetClass="emph"/.test(xml), 'exit: must NOT emit presetClass="emph" for exit-only slide')
			// Each effect emits its distinguishing payload element
			assert(/<p:strVal val="hidden"\/>/.test(xml), 'disappear: expected <p:set> to visibility hidden')
			assert(/<p:animEffect transition="out" filter="fade">/.test(xml), 'fadeOut: expected <p:animEffect transition="out" filter="fade">')
			assert(/<p:strVal val="#ppt_x\+1slide"\/>/.test(xml), 'flyOut: expected end value #ppt_x+1slide (exit toward right)')
			assert(/<p:attrName>ppt_w<\/p:attrName>[\s\S]*?<p:tav tm="100000"><p:val><p:strVal val="0"\/>/.test(xml), 'zoomOut: expected ppt_w scaling to 0')
			// Exit targets an already-visible object: no leading visibility show <p:set>
			assert(!/<p:strVal val="visible"\/>/.test(xml), 'exit: must NOT emit the entrance visibility <p:set>')
			await expectNoSchemaErrors(buf, 'animation-exit')
		}
	},
	{
		name: 'slide with motion-path animation (p:animMotion)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape('ellipse', { x: 1, y: 1, w: 0.5, h: 0.5, fill: { color: '7C3AED' }, animation: { type: 'motionPath', path: 'M 0 0 L 0.3 -0.1 L 0.5 0', duration: 1000 } })
				// default-off: a plain un-animated shape adds no timing/motion
				s.addShape('rect', { x: 4, y: 3, w: 2, h: 1, fill: { color: '00FF00' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: motion-path members carry presetClass="path" (not entr/emph/exit)
			assert(/presetClass="path"/.test(xml), 'motionPath: expected presetClass="path" in timing block')
			assert(!/presetClass="entr"/.test(xml), 'motionPath: must NOT emit presetClass="entr"')
			assert(!/presetClass="emph"/.test(xml), 'motionPath: must NOT emit presetClass="emph"')
			assert(!/presetClass="exit"/.test(xml), 'motionPath: must NOT emit presetClass="exit"')
			// Regression-catch: path string passed through VERBATIM with appended " E" end marker
			assert(/<p:animMotion origin="layout" path="M 0 0 L 0.3 -0.1 L 0.5 0 E" pathEditMode="relative">/.test(xml), 'motionPath: expected verbatim path with appended E marker')
			// Targets ppt_x/ppt_y
			assert(/<p:attrName>ppt_x<\/p:attrName><p:attrName>ppt_y<\/p:attrName>/.test(xml), 'motionPath: expected ppt_x/ppt_y attr targets')
			// Motion targets a visible object: no leading entrance visibility <p:set>
			assert(!/<p:strVal val="visible"\/>/.test(xml), 'motionPath: must NOT emit the entrance visibility <p:set>')
			await expectNoSchemaErrors(buf, 'animation-motion-path')
		}
	},
	{
		name: 'slide with hover hyperlink (a:hlinkHover)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s1 = p.addSlide()
				s1.addText('Hover me', { x: 1, y: 1, w: 4, h: 1, hyperlink: { url: 'https://github.com', tooltip: 'Open', on: 'hover' } })
				// Shape hover hyperlink exercises the CT_NonVisualDrawingProps <a:hlinkHover> path
				s1.addShape('rect', { x: 1, y: 3, w: 4, h: 1, fill: { color: '4472C4' }, hyperlink: { url: 'https://github.com', tooltip: 'Open', on: 'hover' } })
				// default-off: a plain (no `on`) url hyperlink must still emit <a:hlinkClick>
				const s2 = p.addSlide()
				s2.addText('Click me', { x: 1, y: 1, w: 4, h: 1, hyperlink: { url: 'https://github.com' } })
			})
			const xml1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: on:'hover' swaps the text-run element name to <a:hlinkMouseOver>
			// (CT_TextCharacterProperties uses hlinkMouseOver; CT_NonVisualDrawingProps uses hlinkHover)
			assert(/<a:hlinkMouseOver\b/.test(xml1), 'hover: expected <a:hlinkMouseOver> on the hover text run')
			// Shape hover uses <a:hlinkHover> (CT_NonVisualDrawingProps)
			assert(/<a:hlinkHover\b/.test(xml1), 'hover: expected <a:hlinkHover> on the hover shape <p:cNvPr>')
			// ...and the hover objects must NOT emit <a:hlinkClick>
			assert(!/<a:hlinkClick\b/.test(xml1), 'hover: must NOT emit <a:hlinkClick> when on:"hover"')
			// Attributes/tooltip are preserved (CT_Hyperlink is identical for click/hover)
			assert(/tooltip="Open"/.test(xml1), 'hover: expected tooltip="Open" preserved on the hover hyperlink')
			// Default-off invariant: a plain url hyperlink (no `on`) still emits <a:hlinkClick>, no hover
			const xml2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(/<a:hlinkClick\b/.test(xml2), 'hover: default (no on) must still emit <a:hlinkClick>')
			assert(!/<a:hlinkMouseOver\b/.test(xml2), 'hover: default (no on) must NOT emit <a:hlinkMouseOver>')
			assert(!/<a:hlinkHover\b/.test(xml2), 'hover: default (no on) must NOT emit <a:hlinkHover>')
			await expectNoSchemaErrors(buf, 'hyperlink-hover')
		}
	},
	{
		name: 'slide with navigation action jumps (ppaction://hlinkshowjump)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s1 = p.addSlide()
				// Text run nav action (CT_TextCharacterProperties <a:hlinkClick action="ppaction://hlinkshowjump?jump=lastslide">)
				s1.addText('Go to end', { x: 1, y: 1, w: 4, h: 1, hyperlink: { action: 'lastSlide', tooltip: 'End' } })
				// Shape nav action (CT_NonVisualDrawingProps <a:hlinkClick action="ppaction://hlinkshowjump?jump=nextslide">)
				s1.addShape('rect', { x: 1, y: 3, w: 4, h: 1, fill: { color: '4472C4' }, hyperlink: { action: 'nextSlide' } })
				// default-off: a plain url hyperlink must still emit a real rel and NO hlinkshowjump
				const s2 = p.addSlide()
				s2.addText('Click me', { x: 1, y: 1, w: 4, h: 1, hyperlink: { url: 'https://github.com' } })
				p.addSlide()
			})
			const xml1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Navigation verbs emit the ppaction://hlinkshowjump?jump=<verb> URI
			assert(/action="ppaction:\/\/hlinkshowjump\?jump=lastslide"/.test(xml1), 'action: expected ?jump=lastslide on the text-run nav hyperlink')
			assert(/action="ppaction:\/\/hlinkshowjump\?jump=nextslide"/.test(xml1), 'action: expected ?jump=nextslide on the shape nav hyperlink')
			// Navigation jumps carry an EMPTY relationship id (no rel allocated)
			assert(/r:id=""\s+action="ppaction:\/\/hlinkshowjump/.test(xml1), 'action: nav hyperlinks must emit r:id=""')
			// Tooltip preserved on the text-run nav hyperlink
			assert(/tooltip="End"/.test(xml1), 'action: expected tooltip="End" preserved on the nav hyperlink')
			// Default-off invariant: a plain url hyperlink still emits a real rel, no hlinkshowjump
			const xml2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(/<a:hlinkClick r:id="rId\d+"/.test(xml2), 'action: default url hyperlink must still emit a real r:id')
			assert(!/hlinkshowjump/.test(xml2), 'action: default url hyperlink must NOT emit hlinkshowjump')
			await expectNoSchemaErrors(buf, 'hyperlink-action-jump')
		}
	},
	{
		name: 'slide master header/footer (p:hf + footer/date placeholders)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.defineSlideMaster({
					title: 'HF_MASTER',
					headerFooter: { slideNumber: true, dateTime: { format: 'datetime1' }, footer: 'Confidential' }
				})
				p.addSlide({ masterName: 'HF_MASTER' })
			})
			// The first user-defined master lands AFTER the default layout (index 0 → slideLayout1.xml),
			// so scan all slideLayout parts for the derived <p:hf> rather than hardcoding an index.
			const layoutPaths = listEntries(zip).filter(n => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(n))
			let hfLayout = null
			for (const path of layoutPaths) {
				const x = await readEntry(zip, path)
				if (/<p:hf\b/.test(x)) { hfLayout = x; break }
			}
			assert(hfLayout !== null, 'header-footer: expected a slideLayout carrying a derived <p:hf>')
			// Regression-catch: derived <p:hf> must reflect the config (sldNum/ftr/dt = 1, hdr = 0)
			assert(/<p:hf sldNum="1" hdr="0" ftr="1" dt="1"\/>/.test(hfLayout), 'header-footer: expected <p:hf sldNum="1" hdr="0" ftr="1" dt="1"/>')
			// Footer placeholder + its literal text must be present
			assert(/<p:ph type="ftr" sz="quarter" idx="4"\/>/.test(hfLayout), 'header-footer: expected footer placeholder <p:ph type="ftr">')
			assert(/<a:t>Confidential<\/a:t>/.test(hfLayout), 'header-footer: expected footer literal text "Confidential"')
			// Date placeholder (auto field) must be present
			assert(/<p:ph type="dt" idx="1"\/>/.test(hfLayout), 'header-footer: expected date placeholder <p:ph type="dt">')
			assert(/type="datetime1"/.test(hfLayout), 'header-footer: expected date auto-field type="datetime1"')
			// Default-off invariant: the default (unconfigured) layout must carry NO <p:hf>
			const defaultLayout = await readEntry(zip, 'ppt/slideLayouts/slideLayout1.xml')
			assert(!/<p:hf\b/.test(defaultLayout), 'header-footer: default layout must NOT emit <p:hf>')
			await expectNoSchemaErrors(buf, 'header-footer')
		}
	},
	{
		name: 'per-slide header/footer (slide.headerFooter ftr/dt placeholders)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s1 = p.addSlide()
				s1.headerFooter = { footer: 'Confidential — Slide 1', dateTime: { value: 'Q1 2026' } }
				// A second slide with NO headerFooter set → proves the default-off invariant
				p.addSlide()
			})
			const slide1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Regression-catch: slide1 must carry its own footer placeholder + literal text
			assert(/<p:ph type="ftr" sz="quarter" idx="4"\/>/.test(slide1), 'per-slide hf: expected footer placeholder <p:ph type="ftr"> in slide1')
			assert(/<a:t>Confidential — Slide 1<\/a:t>/.test(slide1), 'per-slide hf: expected footer literal text "Confidential — Slide 1" in slide1')
			// Date placeholder with literal (static) value
			assert(/<p:ph type="dt" idx="1"\/>/.test(slide1), 'per-slide hf: expected date placeholder <p:ph type="dt"> in slide1')
			assert(/<a:t>Q1 2026<\/a:t>/.test(slide1), 'per-slide hf: expected date literal text "Q1 2026" in slide1')
			// Default-off invariant: the no-config slide2 must carry NO footer placeholder
			const slide2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(!/<p:ph type="ftr"/.test(slide2), 'per-slide hf: slide2 (no config) must NOT emit a footer placeholder')
			assert(!/<p:ph type="dt"/.test(slide2), 'per-slide hf: slide2 (no config) must NOT emit a date placeholder')
			await expectNoSchemaErrors(buf, 'header-footer-per-slide')
		}
	},
	{
		name: 'notes-master header/footer (pptx.notesMaster p:hf + hdr/ftr text)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.notesMaster = { header: 'Internal Draft', footer: 'Confidential — Notes', slideNumber: true, dateTime: true }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const notesMaster = await readEntry(zip, 'ppt/notesMasters/notesMaster1.xml')
			// Regression-catch: injected <p:hf> reflects the config (all four flags = 1) in the correct CT_NotesMaster position
			assert(/<p:hf sldNum="1" hdr="1" ftr="1" dt="1"\/>/.test(notesMaster), 'notes-hf: expected <p:hf sldNum="1" hdr="1" ftr="1" dt="1"/>')
			// <p:hf> must sit after </p:clrMap> and before <p:notesStyle> (CT_NotesMaster child order)
			assert(/folHlink="folHlink"\/><p:hf [^>]*\/><p:notesStyle>/.test(notesMaster), 'notes-hf: <p:hf> must be between </p:clrMap> and <p:notesStyle>')
			// Header placeholder filled with literal text
			assert(/<a:t>Internal Draft<\/a:t>/.test(notesMaster), 'notes-hf: expected header literal text "Internal Draft"')
			// Footer placeholder filled with literal text
			assert(/<a:t>Confidential — Notes<\/a:t>/.test(notesMaster), 'notes-hf: expected footer literal text "Confidential — Notes"')
			// Default-off invariant: a deck with NO notesMaster config must emit NO <p:hf> in notesMaster1.xml
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const notesMasterDefault = await readEntry(zip2, 'ppt/notesMasters/notesMaster1.xml')
			assert(!/<p:hf\b/.test(notesMasterDefault), 'notes-hf: default (no config) notesMaster1.xml must NOT emit <p:hf>')
			await expectNoSchemaErrors(buf, 'header-footer-notes-master')
		}
	},
	{
		name: 'kinsoku East-Asian line-break rules (pptx.kinsoku -> p:kinsoku)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.kinsoku = { lang: 'ja-JP' }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			// Raw-emission: <p:kinsoku> carries lang + both char-list attrs (ja-JP defaults applied)
			assert(/<p:kinsoku lang="ja-JP" invalStChars="[^"]+" invalEndChars="[^"]+"\/>/.test(presXml), 'kinsoku: expected <p:kinsoku lang="ja-JP" invalStChars=… invalEndChars=…/>')
			// Child-order (CT_Presentation): <p:kinsoku> must sit AFTER </...notesSz...> and BEFORE <p:defaultTextStyle>
			assert(/<p:notesSz [^>]*\/><p:kinsoku [^>]*\/><p:defaultTextStyle>/.test(presXml), 'kinsoku: <p:kinsoku> must be between <p:notesSz> and <p:defaultTextStyle>')
			// XML-escape proof: custom char lists containing & and < emit escaped, not raw
			const { zip: zipEsc } = await build(p => {
				p.kinsoku = { lang: 'en-US', invalStChars: '&<x', invalEndChars: '>"y' }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presEsc = await readEntry(zipEsc, 'ppt/presentation.xml')
			assert(/invalStChars="&amp;&lt;x"/.test(presEsc), 'kinsoku: invalStChars must XML-escape & and <')
			assert(!/invalStChars="&<x"/.test(presEsc), 'kinsoku: raw & / < must NOT appear in invalStChars')
			// Default-off invariant: a deck with NO kinsoku config must emit NO <p:kinsoku>
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presDefault = await readEntry(zip2, 'ppt/presentation.xml')
			assert(!/<p:kinsoku\b/.test(presDefault), 'kinsoku: default (no config) presentation.xml must NOT emit <p:kinsoku>')
			await expectNoSchemaErrors(buf, 'kinsoku')
		}
	},
	{
		name: 'custom shows (pptx.addCustomShow -> p:custShowLst)',
		fn: async () => {
			let s1, s2, s3
			const { buf, zip } = await build(p => {
				s1 = p.addSlide(); s1.addText('one', { x: 1, y: 1, w: 4, h: 1 })
				s2 = p.addSlide(); s2.addText('two', { x: 1, y: 1, w: 4, h: 1 })
				s3 = p.addSlide(); s3.addText('three', { x: 1, y: 1, w: 4, h: 1 })
				p.addCustomShow({ name: 'Exec Summary', slides: [s1, s3] })
				p.addCustomShow({ name: 'Deep Dive', slides: [s1, s2, s3] })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			// First show: name + 0-based id + sldLst with the included slides' r:ids
			assert(
				new RegExp(`<p:custShow name="Exec Summary" id="0"><p:sldLst><p:sld r:id="rId${s1._rId}"/><p:sld r:id="rId${s3._rId}"/></p:sldLst></p:custShow>`).test(presXml),
				'custom-shows: first show must emit name, id="0", and the included slides r:ids'
			)
			// Second show: id increments to 1, all three slides
			assert(
				new RegExp(`<p:custShow name="Deep Dive" id="1"><p:sldLst><p:sld r:id="rId${s1._rId}"/><p:sld r:id="rId${s2._rId}"/><p:sld r:id="rId${s3._rId}"/></p:sldLst></p:custShow>`).test(presXml),
				'custom-shows: second show must have id="1" and all three slides'
			)
			// r:id in the custom show must MATCH the r:id assigned in <p:sldIdLst>
			assert(new RegExp(`<p:sldId id="[0-9]+" r:id="rId${s1._rId}"/>`).test(presXml), 'custom-shows: s1 r:id must match its <p:sldId> entry')
			assert(new RegExp(`<p:sldId id="[0-9]+" r:id="rId${s3._rId}"/>`).test(presXml), 'custom-shows: s3 r:id must match its <p:sldId> entry')
			// Child-order (CT_Presentation): <p:custShowLst> must sit AFTER <p:notesSz> and BEFORE <p:defaultTextStyle>
			assert(/<p:notesSz [^>]*\/><p:custShowLst>/.test(presXml), 'custom-shows: <p:custShowLst> must come right after <p:notesSz>')
			assert(/<\/p:custShowLst><p:defaultTextStyle>/.test(presXml), 'custom-shows: <p:custShowLst> must come before <p:defaultTextStyle>')
			// XML-escape proof: a show name with & and < emits escaped
			let e1, e2
			const { zip: zipEsc } = await build(p => {
				e1 = p.addSlide(); e1.addText('a', { x: 1, y: 1, w: 4, h: 1 })
				e2 = p.addSlide(); e2.addText('b', { x: 1, y: 1, w: 4, h: 1 })
				p.addCustomShow({ name: 'R&D <draft>', slides: [e1, e2] })
			})
			const presEsc = await readEntry(zipEsc, 'ppt/presentation.xml')
			assert(/<p:custShow name="R&amp;D &lt;draft&gt;" id="0">/.test(presEsc), 'custom-shows: name must XML-escape & and <')
			assert(!/name="R&D <draft>"/.test(presEsc), 'custom-shows: raw & / < must NOT appear in name')
			// Default-off invariant: a deck with NO custom shows must emit NO <p:custShowLst>
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presDefault = await readEntry(zip2, 'ppt/presentation.xml')
			assert(!/<p:custShowLst\b/.test(presDefault), 'custom-shows: default (no config) presentation.xml must NOT emit <p:custShowLst>')
			await expectNoSchemaErrors(buf, 'custom-shows')
		}
	},
	{
		name: 'embedded fonts (pptx.embedFont -> p:embeddedFontLst + /ppt/fonts/*.fntdata)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.embedFont({ family: 'Inter', regular: 'data:font/ttf;base64,QUJD', bold: 'data:font/ttf;base64,REVG' })
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			// embedTrueTypeFonts attr + embeddedFontLst with matching rIds (1 slide → base rId8)
			assert(/embedTrueTypeFonts="1"/.test(presXml), 'embedded-fonts: expected embedTrueTypeFonts="1"')
			assert(
				presXml.includes('<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter"/><p:regular r:id="rId8"/><p:bold r:id="rId9"/></p:embeddedFont></p:embeddedFontLst>'),
				'embedded-fonts: expected embeddedFontLst with rId8/rId9; got: ' + presXml
			)
			// Child-order (CT_Presentation): <p:embeddedFontLst> after <p:notesSz>, before <p:defaultTextStyle>
			assert(/<p:notesSz [^>]*\/><p:embeddedFontLst>/.test(presXml), 'embedded-fonts: <p:embeddedFontLst> must come right after <p:notesSz>')
			assert(presXml.indexOf('<p:embeddedFontLst>') < presXml.indexOf('<p:defaultTextStyle>'), 'embedded-fonts: <p:embeddedFontLst> must come before <p:defaultTextStyle>')
			// Parts + rels + Content_Types
			assert(listEntries(zip).includes('ppt/fonts/font1.fntdata'), 'embedded-fonts: expected ppt/fonts/font1.fntdata')
			assert(listEntries(zip).includes('ppt/fonts/font2.fntdata'), 'embedded-fonts: expected ppt/fonts/font2.fntdata')
			const relsXml = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			assert(/Id="rId8" Type="[^"]+\/font" Target="fonts\/font1.fntdata"/.test(relsXml), 'embedded-fonts: expected font rId8 → font1.fntdata')
			const ctXml = await readEntry(zip, '[Content_Types].xml')
			assert(ctXml.includes('<Default Extension="fntdata" ContentType="application/x-fontdata"/>'), 'embedded-fonts: expected fntdata Default')
			// Default-off invariant: a deck with NO embedded fonts must emit nothing
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presDefault = await readEntry(zip2, 'ppt/presentation.xml')
			assert(!/<p:embeddedFontLst/.test(presDefault), 'embedded-fonts: default presentation.xml must NOT emit <p:embeddedFontLst>')
			assert(!/embedTrueTypeFonts/.test(presDefault), 'embedded-fonts: default presentation.xml must NOT emit embedTrueTypeFonts')
			await expectNoSchemaErrors(buf, 'embedded-fonts')
		}
	},
	{
		name: 'slide comments (slide.addComment -> commentAuthors.xml + comments/commentN.xml)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s1 = p.addSlide()
				s1.addComment({ author: 'Reviewer One', text: 'Confirm the Q3 number', x: 1, y: 2 })
				s1.addComment({ author: 'Reviewer One', text: 'second by same author' })
				p.addSlide() // no comments → no part
				p.addSlide().addComment({ author: 'Second Reviewer', text: 'looks good' })
			})
			const entries = listEntries(zip)
			// Parts: shared authors + per-slide comment parts (only for slides WITH comments)
			assert(entries.includes('ppt/commentAuthors.xml'), 'comments: expected ppt/commentAuthors.xml')
			assert(entries.includes('ppt/comments/comment1.xml'), 'comments: expected comment1.xml')
			assert(!entries.includes('ppt/comments/comment2.xml'), 'comments: slide 2 (no comments) → no comment2.xml')
			assert(entries.includes('ppt/comments/comment3.xml'), 'comments: expected comment3.xml')

			// Author dedup + ids
			const authorsXml = await readEntry(zip, 'ppt/commentAuthors.xml')
			assert(authorsXml.includes('<p:cmAuthor id="0" name="Reviewer One" initials="RO" lastIdx="2" clrIdx="0"/>'), 'comments: Reviewer One id=0 lastIdx=2; got: ' + authorsXml)
			assert(authorsXml.includes('<p:cmAuthor id="1" name="Second Reviewer" initials="SR" lastIdx="1" clrIdx="1"/>'), 'comments: Second Reviewer id=1 lastIdx=1; got: ' + authorsXml)

			// Per-comment authorId/idx/pos/text
			const cm1 = await readEntry(zip, 'ppt/comments/comment1.xml')
			assert(cm1.includes('idx="1"><p:pos x="914400" y="1828800"/><p:text>Confirm the Q3 number</p:text>'), 'comments: first comment idx=1 pos/text; got: ' + cm1)
			assert(/authorId="0"[^>]*idx="2">/.test(cm1), 'comments: second comment by same author idx=2')

			// Rels
			const slide1Rels = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			assert(/relationships\/comments" Target="\.\.\/comments\/comment1\.xml"/.test(slide1Rels), 'comments: slide1→comments rel')
			const presRels = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			assert(/relationships\/commentAuthors" Target="commentAuthors\.xml"/.test(presRels), 'comments: presentation→commentAuthors rel')

			// Content_Types overrides
			const ctXml = await readEntry(zip, '[Content_Types].xml')
			assert(ctXml.includes('PartName="/ppt/commentAuthors.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml"'), 'comments: commentAuthors override')
			assert(ctXml.includes('PartName="/ppt/comments/comment1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.comments+xml"'), 'comments: comment1 override')

			// Default-off invariant: a deck with NO comments must emit nothing comment-related
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const e2 = listEntries(zip2)
			assert(!e2.includes('ppt/commentAuthors.xml'), 'comments: default deck must NOT emit commentAuthors.xml')
			assert(!e2.some(e => e.startsWith('ppt/comments/')), 'comments: default deck must NOT emit comment parts')

			await expectNoSchemaErrors(buf, 'comments')
		}
	},
	{
		name: 'text gradient glyph fill (addText color:{type:gradient} -> run-level a:gradFill)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addText('Gradient glyphs', {
					x: 1, y: 1, w: 6, h: 1,
					color: { type: 'gradient', direction: 'horizontal', stops: [{ position: 0, color: 'FF0000' }, { position: 100, color: '0000FF' }] }
				})
			})
			// Baseline: the emitted run-level gradient is schema-clean
			await expectNoSchemaErrors(buf, 'text-gradient')

			// Exact-emission regression-catch: the run's <a:rPr> must carry <a:gradFill> (2 stops + <a:lin>)
			// and MUST NOT carry <a:solidFill>. If genXmlTextRunProperties regressed to solid-only, this fails.
			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const rPr = slideXml.match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s)[1]
			assert(
				rPr.includes('<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="FF0000"/></a:gs><a:gs pos="100000"><a:srgbClr val="0000FF"/></a:gs></a:gsLst><a:lin ang="0" scaled="1"/></a:gradFill>'),
				'text-gradient: expected exact run-level gradFill emission; got: ' + rPr
			)
			assert(!rPr.includes('<a:solidFill>'), 'text-gradient: gradient run must NOT also emit <a:solidFill>; got: ' + rPr)

			// Default-off: a plain string color keeps the solid path (no gradFill)
			const { zip: zipSolid } = await build(p => {
				p.addSlide().addText('Solid', { x: 1, y: 1, w: 6, h: 1, color: 'FF0000' })
			})
			const solidRPr = (await readEntry(zipSolid, 'ppt/slides/slide1.xml')).match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s)[1]
			assert(solidRPr.includes('<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>'), 'text-gradient: string color must emit solidFill')
			assert(!solidRPr.includes('<a:gradFill'), 'text-gradient: string color must NOT emit gradFill')

			// Validator regression-catch (per RUNNER mem-1): a malformed run-level gradFill with an
			// out-of-range stop position (ST_PositiveFixedPercentage max=100000) must be FLAGGED by
			// the OOXMLValidator — proving the schema fixture actually guards the gradFill we emit.
			const badSlide = slideXml.replace('<a:gs pos="100000">', '<a:gs pos="500000">')
			assert(badSlide !== slideXml, 'text-gradient: mutation precondition (found a stop pos to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'text-gradient: validator should flag an out-of-range gradient stop pos (regression-catch)')
		}
	},
	{
		name: 'addCard v2 icons (font-icon run typeface + bare-icon tile suppression)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				// font-icon + bare (no tile) + accent color
				s.addCard({
					x: 0.5, y: 0.5, w: 3, h: 2, title: 'Font Icon',
					icon: { char: '\uf1c4', fontFace: 'Font Awesome 6 Free Solid', color: 'A78BFA' },
					iconFill: 'none',
				})
				// bare svg icon with iconColor
				s.addCard({
					x: 4, y: 0.5, w: 3, h: 2, title: 'Bare SVG',
					icon: { svgPath: { d: 'M3 12h18', viewBox: { w: 24, h: 24 } } },
					iconFill: false, iconColor: '10B981',
				})
			})
			// Baseline: cards compose only already-validated primitives (grpSp, roundRect,
			// custGeom, text runs) — the deck is schema-clean.
			await expectNoSchemaErrors(buf, 'card-v2-icons')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch #1 (font-icon): the glyph run must carry the icon
			// typeface + accent color. If the font-icon arm regressed (e.g. fontFace dropped),
			// this fails. ST_TextTypeface is a plain string, so the validator cannot catch this —
			// hence the explicit assertion (per RUNNER mem-1).
			assert(slideXml.indexOf('typeface="Font Awesome 6 Free Solid"') !== -1, 'card-v2: expected font-icon typeface; got: ' + slideXml)
			assert(slideXml.indexOf('<a:srgbClr val="A78BFA"/>') !== -1, 'card-v2: expected font-icon accent A78BFA')
			// Exact-emission regression-catch #2 (bare-icon): the two bare cards must emit exactly
			// 2 roundRects total (one background each, NO icon-container tiles). If tile suppression
			// regressed, this count rises to 4.
			assert((slideXml.match(/prst="roundRect"/g) || []).length === 2, 'card-v2: expected 2 roundRects (2 bg, 0 icon tiles); got: ' + (slideXml.match(/prst="roundRect"/g) || []).length)
			assert(slideXml.indexOf('<a:custGeom>') !== -1, 'card-v2: expected bare svg custGeom')
			assert(slideXml.indexOf('<a:srgbClr val="10B981"/>') !== -1, 'card-v2: expected iconColor 10B981 on svg glyph')

			// Validator regression-catch (per RUNNER mem-1): prove the OOXMLValidator is actually
			// engaged on this card XML — corrupt a card child's preset geometry to an invalid
			// ST_ShapeType enum and assert the validator flags it.
			const badSlide = slideXml.replace('prst="roundRect"', 'prst="notARealShape"')
			assert(badSlide !== slideXml, 'card-v2: mutation precondition (found a prst to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'card-v2: validator should flag an invalid preset geometry (regression-catch)')
		}
	},
	{
		name: 'addCard v2 accent bar (solid + gradient left-edge bar)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				// solid accent bar
				s.addCard({ x: 0.5, y: 0.5, w: 3, h: 2, title: 'Solid Bar', accentBar: { color: '38BDF8', width: 0.05 } })
				// gradient accent bar
				s.addCard({
					x: 4, y: 0.5, w: 3, h: 2, title: 'Gradient Bar',
					accentBar: { color: { type: 'gradient', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }], direction: 90 } },
				})
			})
			// Baseline: the accent bar composes a single already-validated primitive (a filled
			// rect) — the deck is schema-clean.
			await expectNoSchemaErrors(buf, 'card-v2-accentbar')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch (per RUNNER mem-1): the accent bar is the only
			// `prst="rect"` shape WITH a fill (text frames carry <a:noFill/>, tiles are roundRect).
			// A regress-to-no-bar or a solid<->gradient flip fails these. ST_FillProperties choice
			// is not something the validator catches semantically — hence explicit assertions.
			const solidRe = /prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill>/g
			const gradRe = /prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:gradFill/g
			assert((slideXml.match(solidRe) || []).length === 1, 'accentbar: expected exactly 1 solid-filled accent rect; got: ' + (slideXml.match(solidRe) || []).length)
			assert((slideXml.match(gradRe) || []).length === 1, 'accentbar: expected exactly 1 gradient-filled accent rect; got: ' + (slideXml.match(gradRe) || []).length)
			assert(slideXml.indexOf('<a:srgbClr val="38BDF8"/>') !== -1, 'accentbar: expected solid bar color 38BDF8')

			// Validator regression-catch: prove the OOXMLValidator is engaged on the accent XML —
			// corrupt the accent rect's preset geometry to an invalid ST_ShapeType enum.
			const badSlide = slideXml.replace('prst="rect"', 'prst="notARealShape"')
			assert(badSlide !== slideXml, 'accentbar: mutation precondition (found a prst to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'accentbar: validator should flag an invalid preset geometry (regression-catch)')
		}
	},
	{
		name: 'addCard v2 multi-colour SVG ({parts} from parseSvg → one custGeom per part)',
		fn: async () => {
			// Real parseSvg() output drives the card: a 3-colour fill logo, a gradient disc, and a
			// stroked line — so every per-part `d` must validate as <a:custGeom> inside a real card.
			const logoSvg = '<svg viewBox="0 0 24 24">' +
				'<circle cx="12" cy="12" r="10" fill="#7C3AED"/>' +
				'<path d="M6 6 L12 6 L9 12 Z" fill="#38BDF8"/>' +
				'<path d="M2 18 a4 4 0 0 1 8 0" fill="none" stroke="#10B981" stroke-width="2"/>' +
				'</svg>'
			const parts = parseSvg(logoSvg)
			assert(parts.length >= 3, 'card-v2-parts: parseSvg precondition (>=3 parts); got: ' + parts.length)
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addCard({ x: 0.5, y: 0.5, w: 3.5, h: 2.5, title: 'Multi-colour Logo', icon: { parts } })
				// control card (single v1 svgPath) on the same slide proves the parts arm is additive
				s.addCard({ x: 4.5, y: 0.5, w: 3, h: 2, title: 'Control', icon: { svgPath: { d: 'M3 12h18', viewBox: { w: 24, h: 24 } } } })
			})
			// Baseline: every normalised part `d` is OOXML-consumable inside a real card — schema-clean.
			await expectNoSchemaErrors(buf, 'card-v2-parts')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch (per RUNNER mem-1): one custGeom per logo part PLUS the
			// control card's single svgPath custGeom. A regress that flattens parts to one fill, or
			// that drops/duplicates a part, fails this count — the validator can't catch it semantically.
			const custGeomCount = (slideXml.match(/<a:custGeom>/g) || []).length
			assert(custGeomCount === parts.length + 1, `card-v2-parts: expected ${parts.length + 1} custGeom (${parts.length} parts + 1 control), got ${custGeomCount}`)

			// Validator regression-catch: prove the OOXMLValidator is engaged on the part XML —
			// corrupt a custGeom preset path command count to an invalid value.
			const badSlide = slideXml.replace('<a:custGeom>', '<a:custGeom><a:bogusElement/>')
			assert(badSlide !== slideXml, 'card-v2-parts: mutation precondition (found a custGeom to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'card-v2-parts: validator should flag the corrupted custGeom (regression-catch)')
		}
	},
	{
		name: 'addCard v2 count badge (ellipse bubble + value text, top-right + inline-right)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				// top-right count badge (default fill)
				s.addCard({ x: 0.5, y: 0.5, w: 3, h: 2, title: 'Inbox', badge: { type: 'count', value: 7 } })
				// inline-right count badge with custom fill/colour
				s.addCard({ x: 4, y: 0.5, w: 3, h: 2, title: 'Alerts', badge: { type: 'count', value: 23, fill: 'EF4444', color: '111827', position: 'inline-right' } })
			})
			// Baseline: the count badge composes already-validated primitives (ellipse + text run)
			// inside the card group — the deck is schema-clean.
			await expectNoSchemaErrors(buf, 'card-v2-count-badge')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch (per RUNNER mem-1): two count bubbles → exactly 2
			// ellipses; value text + custom fill present. ST_ShapeType=ellipse + the value string
			// are not things the validator catches semantically — hence explicit assertions.
			assert((slideXml.match(/prst="ellipse"/g) || []).length === 2, 'count-badge: expected 2 ellipse bubbles; got: ' + (slideXml.match(/prst="ellipse"/g) || []).length)
			assert(slideXml.indexOf('<a:t>7</a:t>') !== -1, 'count-badge: expected value text 7')
			assert(slideXml.indexOf('<a:t>23</a:t>') !== -1, 'count-badge: expected value text 23')
			assert(slideXml.indexOf('<a:srgbClr val="EF4444"/>') !== -1, 'count-badge: expected custom bubble fill EF4444')

			// Validator regression-catch: prove the OOXMLValidator is engaged on the bubble XML —
			// corrupt the ellipse preset geometry to an invalid ST_ShapeType enum.
			const badSlide = slideXml.replace('prst="ellipse"', 'prst="notARealShape"')
			assert(badSlide !== slideXml, 'count-badge: mutation precondition (found a prst to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'count-badge: validator should flag an invalid preset geometry (regression-catch)')
		}
	},
	{
		name: 'addCallout v2 (accent bar + attribution + gradient bar)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				// solid accent bar + attribution + italic body
				s.addCallout({
					x: 0.5, y: 0.5, w: 8, h: 1.2,
					text: 'The dispatcher is the game changer.',
					attribution: '— Internal power user feedback',
					fill: '1E1A2B', fontColor: 'D4D0DE', fontItalic: true, align: 'left',
					accentBar: { color: '7C3AED', width: 0.04 },
					attributionFont: { size: 9, color: '64748B' },
					padding: { l: 0.25, r: 0.2, t: 0.15, b: 0.15 },
				})
				// gradient accent bar
				s.addCallout({
					x: 0.5, y: 2, w: 8, h: 1, text: 'Gradient bar callout',
					accentBar: { color: { type: 'gradient', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }], direction: 90 } },
				})
			})
			// Baseline: the v2 callout composes already-validated primitives (group + roundRect +
			// filled rect + text boxes) — the deck is schema-clean.
			await expectNoSchemaErrors(buf, 'callout-v2')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch (per RUNNER mem-1): the accent bar is the only
			// `prst="rect"` shape WITH a fill (body/attribution text frames carry <a:noFill/>).
			// A regress-to-no-bar or a solid<->gradient flip fails these — the validator can't
			// catch a ST_FillProperties choice semantically.
			const solidRe = /prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:solidFill>/g
			const gradRe = /prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom><a:gradFill/g
			assert((slideXml.match(solidRe) || []).length === 1, 'callout-v2: expected exactly 1 solid-filled accent rect; got: ' + (slideXml.match(solidRe) || []).length)
			assert((slideXml.match(gradRe) || []).length === 1, 'callout-v2: expected exactly 1 gradient-filled accent rect; got: ' + (slideXml.match(gradRe) || []).length)
			// the v2 callouts are groups
			assert((slideXml.match(/<p:grpSp>/g) || []).length === 2, 'callout-v2: expected 2 callout groups')
			// attribution run present + dropped-attribution guard
			assert(slideXml.indexOf('<a:t>— Internal power user feedback</a:t>') !== -1, 'callout-v2: expected attribution run')

			// Validator regression-catch: prove the OOXMLValidator is engaged on the callout XML —
			// corrupt the accent rect preset geometry to an invalid ST_ShapeType enum.
			const badSlide = slideXml.replace('prst="rect"', 'prst="notARealShape"')
			assert(badSlide !== slideXml, 'callout-v2: mutation precondition (found a prst to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'callout-v2: validator should flag an invalid preset geometry (regression-catch)')
		}
	},
	{
		name: 'avatar & badge helpers (ellipse disc / roundRect pill / circle bubble + centred labels)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addAvatar({ x: 0.5, y: 0.5, size: 0.4, initials: 'JS', fill: '4B3F72' })
				s.addBadge({ x: 2, y: 0.5, text: 'NEW', fill: '10B981' })
				s.addBadge({ x: 4, y: 0.5, text: '3', shape: 'circle', fill: '7C3AED' })
				// avatar inside a group (mockup sidebar)
				const g = s.addGroup({ x: 6, y: 0.5, w: 2, h: 0.5 })
				g.addAvatar({ x: 0, y: 0, size: 0.3, initials: 'AB', fill: '224466' })
			})
			// Baseline: avatar/badge compose only already-validated primitives (ellipse, roundRect,
			// grpSp, text runs) — the deck is schema-clean.
			await expectNoSchemaErrors(buf, 'avatar-badge')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch (per RUNNER mem-1): these compose already-validated
			// primitives, so the validator cannot catch a behavioural regression (wrong shape,
			// dropped pill radius, lost label). Assert the exact emission explicitly.
			// 2 ellipses (avatar disc + circle bubble) + 1 ellipse in the group avatar = 3 total.
			assert((slideXml.match(/prst="ellipse"/g) || []).length === 3, 'avatar-badge: expected 3 ellipses (2 avatars + 1 count bubble); got: ' + (slideXml.match(/prst="ellipse"/g) || []).length)
			// 1 roundRect for the pill, with a FULL-pill adj (50000)
			assert((slideXml.match(/prst="roundRect"/g) || []).length === 1, 'avatar-badge: expected exactly 1 pill roundRect; got: ' + (slideXml.match(/prst="roundRect"/g) || []).length)
			assert(/prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"\/>/.test(slideXml), 'avatar-badge: expected full-pill adj 50000; got: ' + slideXml)
			// fills + labels present
			assert(slideXml.indexOf('<a:srgbClr val="4B3F72"/>') !== -1, 'avatar-badge: expected avatar disc fill 4B3F72')
			assert(slideXml.indexOf('<a:srgbClr val="10B981"/>') !== -1, 'avatar-badge: expected pill fill 10B981')
			assert(slideXml.indexOf('<a:t>JS</a:t>') !== -1, 'avatar-badge: expected avatar initials JS')
			assert(slideXml.indexOf('<a:t>NEW</a:t>') !== -1, 'avatar-badge: expected pill label NEW')
			assert(slideXml.indexOf('<a:t>3</a:t>') !== -1, 'avatar-badge: expected count label 3')
			// group avatar composes inside the grpSp
			const grp = slideXml.match(/<p:grpSp>[\s\S]*<\/p:grpSp>/)
			assert(grp && grp[0].indexOf('<a:t>AB</a:t>') !== -1, 'avatar-badge: expected group avatar initials AB inside grpSp')

			// Validator regression-catch: prove the OOXMLValidator is engaged on this XML —
			// corrupt an ellipse preset geometry to an invalid ST_ShapeType enum.
			const badSlide = slideXml.replace('prst="ellipse"', 'prst="notARealShape"')
			assert(badSlide !== slideXml, 'avatar-badge: mutation precondition (found a prst to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'avatar-badge: validator should flag an invalid preset geometry (regression-catch)')
		}
	},
	{
		name: 'handout master (defineHandoutMaster -> part + rel + Override + handoutMasterIdLst)',
		fn: async () => {
			// Multi-slide deck so N affects the rId arithmetic (handoutMasterRid = N+7 with no fonts/comments).
			const { buf, zip } = await build(p => {
				p.addSlide().addText('one', { x: 1, y: 1, w: 4, h: 1 })
				p.addSlide().addText('two', { x: 1, y: 1, w: 4, h: 1 })
				p.defineHandoutMaster({ background: 'FFF7ED', headerFooter: { header: 'Internal', footer: 'Confidential', dateTime: true, slideNumber: true } })
			})
			// Baseline: the whole package validates clean.
			await expectNoSchemaErrors(buf, 'handout-master')

			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			const relsXml = await readEntry(zip, 'ppt/_rels/presentation.xml.rels')
			const ct = await readEntry(zip, '[Content_Types].xml')

			// (i) CT_Presentation child order: handoutMasterIdLst AFTER notesMasterIdLst, BEFORE sldIdLst.
			const iNotes = presXml.indexOf('</p:notesMasterIdLst>')
			const iHandout = presXml.indexOf('<p:handoutMasterIdLst>')
			const iSld = presXml.indexOf('<p:sldIdLst>')
			assert(iNotes !== -1 && iHandout !== -1 && iSld !== -1, 'handout: idLst elements missing')
			assert(iNotes < iHandout && iHandout < iSld, 'handout: idLst ordering wrong (need notes < handout < sld)')

			// (ii) The r:id RESOLVES to a unique handoutMaster Relationship (cross-entity invariant — the
			// XSD validator will NOT catch a dangling r:id since it is a plain string, so assert explicitly).
			const m = presXml.match(/<p:handoutMasterId r:id="(rId\d+)"\/>/)
			assert(m, 'handout: handoutMasterId element missing')
			const rid = m[1]
			assert(rid === 'rId9', 'handout: expected rId9 for a 2-slide deck (N+7); got ' + rid)
			const relRe = new RegExp('<Relationship Id="' + rid + '" Type="[^"]*relationships/handoutMaster" Target="handoutMasters/handoutMaster1.xml"/>')
			assert(relRe.test(relsXml), 'handout: rel for ' + rid + ' not found in presentation.xml.rels')
			assert((relsXml.match(new RegExp('Id="' + rid + '"', 'g')) || []).length === 1, 'handout: r:id must be unique in rels')

			// Existing fixed rels are unchanged vs a no-handout deck (theme/tableStyles ids preserved).
			const { zip: zipNo } = await build(p => {
				p.addSlide().addText('one', { x: 1, y: 1, w: 4, h: 1 })
				p.addSlide().addText('two', { x: 1, y: 1, w: 4, h: 1 })
			})
			const relsNo = await readEntry(zipNo, 'ppt/_rels/presentation.xml.rels')
			const themeRel = relsNo.match(/<Relationship Id="(rId\d+)" Type="[^"]*relationships\/theme"/)
			assert(themeRel && relsXml.indexOf(`Id="${themeRel[1]}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"`) !== -1,
				'handout: existing theme rId must be unchanged by appending the handout rel')

			// (iii) the handoutMaster1.xml part exists and parses; (iv) Content_Types Override present.
			const handoutXml = await readEntry(zip, 'ppt/handoutMasters/handoutMaster1.xml')
			assert(handoutXml.indexOf('<p:handoutMaster') !== -1 && handoutXml.indexOf('</p:handoutMaster>') !== -1, 'handout: part malformed')
			assert(handoutXml.indexOf('<p:hf sldNum="1" hdr="1" ftr="1" dt="1"/>') !== -1, 'handout: hf flags wrong')
			assert(handoutXml.indexOf('<a:srgbClr val="FFF7ED"/>') !== -1, 'handout: background fill missing')
			assert(ct.indexOf('PartName="/ppt/handoutMasters/handoutMaster1.xml"') !== -1, 'handout: Content_Types Override missing')

			// DEFAULT-OFF: a deck without defineHandoutMaster emits NONE of these.
			assert(relsNo.indexOf('relationships/handoutMaster') === -1, 'handout: default-off deck must have no handout rel')
			const presNo = await readEntry(zipNo, 'ppt/presentation.xml')
			assert(presNo.indexOf('handoutMasterIdLst') === -1, 'handout: default-off deck must have no idLst')

			// Validator regression-catch: prove the validator is engaged — corrupt the handout part's
			// content (invalid child element) and confirm errors surface.
			const badHandout = handoutXml.replace('<p:cSld>', '<p:cSld><p:notAValidChild/>')
			assert(badHandout !== handoutXml, 'handout: mutation precondition')
			zip.file('ppt/handoutMasters/handoutMaster1.xml', badHandout)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'handout: validator should flag an invalid child in the handout part (regression-catch)')
		}
	},
	{
		name: 'separator helper (thin horizontal/vertical rect rule + opacity alpha)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addSeparator({ x: 1, y: 2, w: 4 })                                                  // horizontal default (gray, 0.5 opacity)
				s.addSeparator({ x: 1, y: 3, w: 3, color: 'FF0000', thickness: 0.05, opacity: 0.8 })  // explicit colour/opacity
				s.addSeparator({ x: 6, y: 1, h: 2, orientation: 'vertical', color: '3B82F6' })        // vertical rule
				// separator inside a group (mockup sidebar divider)
				const g = s.addGroup({ x: 7, y: 3, w: 2, h: 1 })
				g.addSeparator({ x: 0, y: 0, w: 1.5, color: '10B981' })
			})
			// Baseline: separators compose only the already-validated `rect` primitive — schema-clean.
			await expectNoSchemaErrors(buf, 'separator')

			const slideXml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Exact-emission regression-catch (per RUNNER mem-1): a plain rect is schema-valid even
			// if the transparency math or geometry regresses, so assert the exact emission explicitly.
			// 4 rects total (3 slide-level + 1 in the group). NB: no text boxes here, so every rect is a separator.
			assert((slideXml.match(/prst="rect"/g) || []).length === 4, 'separator: expected 4 rects (3 slide + 1 group); got: ' + (slideXml.match(/prst="rect"/g) || []).length)
			// default opacity 0.5 -> transparency 50 -> alpha 50000 on the gray rule
			assert(slideXml.indexOf('<a:srgbClr val="D4D4D8"><a:alpha val="50000"/></a:srgbClr>') !== -1, 'separator: expected default gray D4D4D8 alpha 50000')
			// explicit opacity 0.8 -> transparency 20 -> alpha 80000
			assert(slideXml.indexOf('<a:srgbClr val="FF0000"><a:alpha val="80000"/></a:srgbClr>') !== -1, 'separator: expected FF0000 alpha 80000')
			// group separator composes inside the grpSp
			const grp = slideXml.match(/<p:grpSp>[\s\S]*<\/p:grpSp>/)
			assert(grp && grp[0].indexOf('<a:srgbClr val="10B981">') !== -1, 'separator: expected group rule fill 10B981 inside grpSp')

			// Validator regression-catch: prove the OOXMLValidator is engaged on this XML —
			// corrupt the rect preset geometry to an invalid ST_ShapeType enum.
			const badSlide = slideXml.replace('prst="rect"', 'prst="notARealShape"')
			assert(badSlide !== slideXml, 'separator: mutation precondition (found a prst to corrupt)')
			zip.file('ppt/slides/slide1.xml', badSlide)
			const badBuf = await zip.generateAsync({ type: 'nodebuffer' })
			const badErrors = await validateBuf(badBuf)
			assert(badErrors.length > 0, 'separator: validator should flag an invalid preset geometry (regression-catch)')
		}
	},
	{
		name: 'photo album (pptx.photoAlbum -> p:photoAlbum)',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.photoAlbum = { blackWhite: false, showCaptions: true, layout: 'fitToSlide', frame: 'frameStyle1' }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presXml = await readEntry(zip, 'ppt/presentation.xml')
			// Raw-emission: exact attribute mapping (boolean -> "0"/"1", layout/frame verbatim)
			assert(/<p:photoAlbum bw="0" showCaptions="1" layout="fitToSlide" frame="frameStyle1"\/>/.test(presXml), 'photo-album: expected <p:photoAlbum bw="0" showCaptions="1" layout="fitToSlide" frame="frameStyle1"/>')
			// Child-order (CT_Presentation): <p:photoAlbum> must sit BEFORE <p:defaultTextStyle> (after custShowLst/notesSz)
			assert(presXml.indexOf('<p:photoAlbum') < presXml.indexOf('<p:defaultTextStyle>'), 'photo-album: <p:photoAlbum> must come before <p:defaultTextStyle>')
			// Co-set with kinsoku: photoAlbum precedes kinsoku per canonical order
			const { zip: zipBoth } = await build(p => {
				p.photoAlbum = { showCaptions: true }
				p.kinsoku = { lang: 'ja-JP' }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presBoth = await readEntry(zipBoth, 'ppt/presentation.xml')
			assert(presBoth.indexOf('<p:photoAlbum') < presBoth.indexOf('<p:kinsoku'), 'photo-album: <p:photoAlbum> must precede <p:kinsoku>')
			// Optional-attr proof: no layout/frame -> emit only bw + showCaptions, NO layout=/frame=
			assert(/<p:photoAlbum bw="0" showCaptions="1"\/>/.test(presBoth), 'photo-album: omitted layout/frame must NOT be emitted')
			assert(!/<p:photoAlbum[^>]*layout=/.test(presBoth), 'photo-album: layout attr must be absent when unset')
			assert(!/<p:photoAlbum[^>]*frame=/.test(presBoth), 'photo-album: frame attr must be absent when unset')
			// blackWhite:true maps bw="1"
			const { zip: zipBw } = await build(p => {
				p.photoAlbum = { blackWhite: true }
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presBw = await readEntry(zipBw, 'ppt/presentation.xml')
			assert(/<p:photoAlbum bw="1" showCaptions="0"\/>/.test(presBw), 'photo-album: blackWhite:true must map to bw="1"')
			// Default-off invariant: a deck with NO photoAlbum config must emit NO <p:photoAlbum>
			const { zip: zip2 } = await build(p => {
				p.addSlide().addText('x', { x: 1, y: 1, w: 4, h: 1 })
			})
			const presDefault = await readEntry(zip2, 'ppt/presentation.xml')
			assert(!/<p:photoAlbum\b/.test(presDefault), 'photo-album: default (no config) presentation.xml must NOT emit <p:photoAlbum>')
			await expectNoSchemaErrors(buf, 'photo-album')
		}
	},
	{
		name: 'structured talking-points notes (slide.addNotes(NoteParagraph[]))',
		fn: async () => {
			const { buf, zip } = await build(p => {
				// slide1: structured array — bullet, bullet+indent lvl=1, plain
				p.addSlide().addNotes([
					{ text: 'Open with the problem', bullet: true },
					{ text: 'Mention the 3 key metrics', bullet: true, indentLevel: 1 },
					{ text: 'Transition to the demo' },
				])
				// slide2: plain string — must take the UNCHANGED byte-identical path
				p.addSlide().addNotes('Plain string note')
			})
			const notes1 = await readEntry(zip, 'ppt/notesSlides/notesSlide1.xml')
			const notes2 = await readEntry(zip, 'ppt/notesSlides/notesSlide2.xml')

			// --- slide1 structured asserts ---
			// THREE <a:p> paragraphs in the body placeholder
			const bodyMatch = notes1.match(/<p:ph type="body" idx="1"\/>[\s\S]*?<a:lstStyle\/>([\s\S]*?)<\/p:txBody>/)
			assert(bodyMatch, 'structured-notes: could not locate notes body placeholder in notesSlide1')
			const body1 = bodyMatch[1]
			assert((body1.match(/<a:p>/g) || []).length === 3, 'structured-notes: expected exactly 3 <a:p> paragraphs')
			// bullet paragraphs carry <a:buChar char="•"/>
			assert((body1.match(/<a:buChar char="•"\/>/g) || []).length === 2, 'structured-notes: expected 2 bullet paragraphs with <a:buChar char="•"/>')
			// second paragraph has lvl="1"
			assert(/<a:pPr lvl="1"><a:buChar char="•"\/><\/a:pPr><a:r><a:t>Mention the 3 key metrics<\/a:t>/.test(body1), 'structured-notes: indented bullet must emit <a:pPr lvl="1"><a:buChar char="•"/>')
			// first paragraph: bullet, no lvl
			assert(/<a:p><a:pPr><a:buChar char="•"\/><\/a:pPr><a:r><a:t>Open with the problem<\/a:t>/.test(body1), 'structured-notes: first bullet must have <a:pPr> with buChar and NO lvl')
			// third paragraph: plain, NO <a:pPr>
			assert(/<a:p><a:r><a:t>Transition to the demo<\/a:t><\/a:r><\/a:p>/.test(body1), 'structured-notes: plain paragraph must have NO <a:pPr>')

			// --- slide2 string path byte-identical proof ---
			assert(/<a:p><a:r><a:rPr lang="en-US" dirty="0"\/><a:t>Plain string note<\/a:t><\/a:r><a:endParaRPr lang="en-US" dirty="0"\/><\/a:p>/.test(notes2), 'structured-notes: plain string note must use the UNCHANGED single-paragraph literal')
			assert(!/<a:buChar/.test(notes2), 'structured-notes: string-path notes must NOT emit any <a:buChar>')

			// both notes slides schema-clean
			await expectNoSchemaErrors(buf, 'structured-notes')
		}
	},
	{
		name: 'slide with number-counter (stacked appear/disappear frames)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('', { x: 1, y: 1, w: 4, h: 1, fontSize: 48, counter: { from: 1, to: 3, suffix: '%', stepMs: 180 } })
			})
			await expectNoSchemaErrors(buf, 'animation-counter')
		}
	},
	{
		name: 'multi-column text (numCol/spcCol on bodyPr)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addText('lorem ipsum dolor sit amet, consectetur adipiscing elit', { x: 1, y: 1, w: 6, h: 3, columns: 2, columnSpacing: 0.4 })
			})
			await expectNoSchemaErrors(buf, 'multicol-text')
		}
	},
	{
		name: 'svgPath custom-geometry shape (triangle)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 2, h: 2,
					fill: { color: '7C3AED' },
					svgPath: { d: 'M 0 0 L 12 0 L 6 12 Z', viewBox: { w: 12, h: 12 } }
				})
			})
			await expectNoSchemaErrors(buf, 'svgpath-triangle')
		}
	},
	{
		name: 'svgPath custom-geometry shape (cubic + quadratic + relative)',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 3, h: 3,
					fill: { color: '38BDF8' },
					svgPath: { d: 'M 0 0 C 0 12 12 12 12 0 Q 6 6 0 0 z m 2 2 l 4 0 l 0 4 z', viewBox: { w: 24, h: 24 } }
				})
			})
			await expectNoSchemaErrors(buf, 'svgpath-curves')
		}
	},
	{
		name: 'sections emit uppercase GUID ids (ST_Guid)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSection({ title: 'Intro' })
				p.addSlide({ sectionTitle: 'Intro' }).addText('hi', { x: 1, y: 1, w: 4, h: 1 })
				p.addSection({ title: 'Body' })
				p.addSlide({ sectionTitle: 'Body' }).addText('there', { x: 1, y: 1, w: 4, h: 1 })
			})
			await expectNoSchemaErrors(buf, 'sections-guid')
		}
	},
	{
		name: 'shape group (addGroup) with nested shape + text',
		fn: async () => {
			const { buf } = await build(p => {
				const s = p.addSlide()
				const g = s.addGroup({ x: 1, y: 2, w: 8, h: 4 })
				g.addShape('roundRect', { x: 0.5, y: 0.5, w: 2, h: 2, fill: { color: '1A1A24' } })
				g.addText('Grouped', { x: 0.6, y: 0.7, w: 1.8, h: 1, color: 'FFFFFF' })
			})
			await expectNoSchemaErrors(buf, 'shape-group')
		}
	},
	{
		name: 'line shape with negative width normalizes to positive cx + flipH',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('line', { x: 5, y: 2, w: -2, h: 1, line: { color: '7C3AED', width: 1 } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// The first <a:xfrm> belongs to the spTree group (has chOff/chExt); select the shape's xfrm.
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cx = Number((xfrm.match(/<a:ext\s+cx="(-?\d+)"/) || [])[1])
			assert(cx > 0, `negative-width line: expected cx > 0, got ${cx} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipH="1"/.test(xfrm), `negative-width line: expected flipH="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'line-negative-width')
		}
	},
	{
		name: 'line shape with negative height normalizes to positive cy + flipV',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('line', { x: 5, y: 4, w: 2, h: -1.5, line: { color: '38BDF8', width: 1 } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cy = Number((xfrm.match(/<a:ext\s+cx="-?\d+"\s+cy="(-?\d+)"/) || [])[1])
			assert(cy > 0, `negative-height line: expected cy > 0, got ${cy} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipV="1"/.test(xfrm), `negative-height line: expected flipV="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'line-negative-height')
		}
	},
	{
		name: 'rect shape with negative width normalizes to positive cx + flipH',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('rect', { x: 5, y: 2, w: -2, h: 1, fill: { color: '7C3AED' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// The first <a:xfrm> belongs to the spTree group (has chOff/chExt); select the shape's xfrm.
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cx = Number((xfrm.match(/<a:ext\s+cx="(-?\d+)"/) || [])[1])
			assert(cx > 0, `negative-width rect: expected cx > 0, got ${cx} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipH="1"/.test(xfrm), `negative-width rect: expected flipH="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'rect-negative-width')
		}
	},
	{
		name: 'image with negative height normalizes to positive cy + flipV',
		fn: async () => {
			const b64 =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const { buf, zip } = await build(p => {
				p.addSlide().addImage({ data: 'image/png;base64,' + b64, x: 1, y: 4, w: 2, h: -1.5 })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xfrm = (xml.match(/<a:xfrm[^>]*>(?:(?!<\/a:xfrm>).)*?<\/a:xfrm>/gs) || []).find(x => !x.includes('chOff')) || ''
			const cy = Number((xfrm.match(/<a:ext\s+cx="-?\d+"\s+cy="(-?\d+)"/) || [])[1])
			assert(cy > 0, `negative-height image: expected cy > 0, got ${cy} (xfrm: ${xfrm})`)
			assert(/<a:xfrm[^>]*\bflipV="1"/.test(xfrm), `negative-height image: expected flipV="1" on xfrm (xfrm: ${xfrm})`)
			await expectNoSchemaErrors(buf, 'image-negative-height')
		}
	},
	{
		name: 'shape shadow with out-of-range angle/opacity clamps to valid ST_PositiveFixedAngle + alpha',
		fn: async () => {
			// angle=-45 (<0) and opacity=1.5 (>1) are both out of range; correctShadowOptions
			// (gen-utils) must reset them to the defaults 270° / 0.75 before emit. Without the
			// clamp the emit produces dir="-2700000" (negative ST_PositiveFixedAngle) and
			// alpha val="150000" (>100000 ST_PositiveFixedPercentage) — both schema-invalid.
			const { buf, zip } = await build(p => {
				p.addSlide().addShape('rect', {
					x: 1, y: 1, w: 4, h: 1,
					fill: { color: '00B0B9' },
					shadow: { type: 'outer', blur: 6, offset: 2, color: '000000', angle: -45, opacity: 1.5 }
				})
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const shdw = (xml.match(/<a:outerShdw[^>]*>/) || [])[0] || ''
			const dir = Number((shdw.match(/\bdir="(-?\d+)"/) || [])[1])
			// ST_PositiveFixedAngle: 0 .. 21600000 (60000ths of a degree, 0-360°)
			assert(dir >= 0 && dir <= 21600000, `shadow angle: expected dir in 0..21600000, got ${dir} (shdw: ${shdw})`)
			assert(dir === 16200000, `shadow angle: expected out-of-range -45 to clamp to 270° (16200000), got ${dir}`)
			const alpha = Number((xml.match(/<a:outerShdw[\s\S]*?<a:alpha\s+val="(-?\d+)"/) || [])[1])
			// ST_PositiveFixedPercentage: 0 .. 100000
			assert(alpha >= 0 && alpha <= 100000, `shadow opacity: expected alpha in 0..100000, got ${alpha}`)
			assert(alpha === 75000, `shadow opacity: expected out-of-range 1.5 to clamp to 0.75 (75000), got ${alpha}`)
			await expectNoSchemaErrors(buf, 'shadow-out-of-range-clamp')
		}
	},
	{
		name: 'bar chart (single series, multi category)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BAR, [
					{ name: 'Sales', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [12, 26, 18, 31] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-bar')
		}
	},
	{
		name: 'line chart (multi series)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.LINE, [
					{ name: 'North', labels: ['Jan', 'Feb', 'Mar'], values: [10, 20, 15] },
					{ name: 'South', labels: ['Jan', 'Feb', 'Mar'], values: [5, 12, 22] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-line')
		}
	},
	{
		name: 'pie chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.PIE, [
					{ name: 'Share', labels: ['A', 'B', 'C'], values: [40, 35, 25] }
				], { x: 1, y: 1, w: 5, h: 4 })
			})
			await expectNoSchemaErrors(buf, 'chart-pie')
		}
	},
	{
		name: 'doughnut chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.DOUGHNUT, [
					{ name: 'Share', labels: ['A', 'B', 'C', 'D'], values: [10, 20, 30, 40] }
				], { x: 1, y: 1, w: 5, h: 4, holeSize: 60 })
			})
			await expectNoSchemaErrors(buf, 'chart-doughnut')
		}
	},
	{
		name: 'area chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.AREA, [
					{ name: 'Traffic', labels: ['Mon', 'Tue', 'Wed', 'Thu'], values: [3, 7, 5, 9] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-area')
		}
	},
	{
		name: 'radar chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.RADAR, [
					{ name: 'Skill', labels: ['Speed', 'Power', 'Range', 'Agility', 'Stamina'], values: [4, 5, 3, 4, 2] }
				], { x: 1, y: 1, w: 5, h: 4 })
			})
			await expectNoSchemaErrors(buf, 'chart-radar')
		}
	},
	{
		name: 'bar3D chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BAR3D, [
					{ name: 'Units', labels: ['X', 'Y', 'Z'], values: [8, 14, 6] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-bar3d')
		}
	},
	{
		name: 'scatter (XY) chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.SCATTER, [
					{ name: 'X-Axis', values: [0, 1, 2, 3, 4, 5] },
					{ name: 'Y-Value 1', values: [90, 80, 70, 85, 75, 92] },
					{ name: 'Y-Value 2', values: [21, 32, 40, 49, 31, 29] }
				], { x: 1, y: 1, w: 6, h: 3, showLabel: true })
			})
			await expectNoSchemaErrors(buf, 'chart-scatter')
		}
	},
	{
		name: 'bubble chart',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BUBBLE, [
					{ name: 'X-Axis', values: [0.3, 0.6, 0.9, 1.2, 1.5, 1.7] },
					{ name: 'Y-Value 1', values: [1.3, 9, 7.5, 2.5, 7.5, 3], sizes: [1, 4, 2, 3, 7, 4] },
					{ name: 'Y-Value 2', values: [5.0, 3, 2.0, 7.0, 2.0, 9], sizes: [9, 7, 9, 2, 4, 8] }
				], { x: 1, y: 1, w: 6, h: 3 })
			})
			await expectNoSchemaErrors(buf, 'chart-bubble')
		}
	},
	{
		name: 'bar chart with explicit value-axis min/max',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart(p.charts.BAR, [
					{ name: 'Score', labels: ['A', 'B', 'C'], values: [20, 55, 80] }
				], { x: 1, y: 1, w: 6, h: 3, valAxisMinVal: 0, valAxisMaxVal: 100, valAxisMajorUnit: 20 })
			})
			await expectNoSchemaErrors(buf, 'chart-bar-axis-minmax')
		}
	},
	{
		name: 'multi-type combo chart (bar + secondary line)',
		fn: async () => {
			const { buf } = await build(p => {
				p.addSlide().addChart([
					{ type: p.charts.BAR, data: [{ name: 'Revenue', labels: ['Q1', 'Q2', 'Q3'], values: [10, 20, 30] }], options: {} },
					{ type: p.charts.LINE, data: [{ name: 'Growth', labels: ['Q1', 'Q2', 'Q3'], values: [1, 2, 3] }], options: { secondaryValAxis: true, secondaryCatAxis: true } }
				], { x: 1, y: 1, w: 6, h: 3, valAxes: [{ showValAxisTitle: false }, { showValAxisTitle: false }], catAxes: [{}, {}] })
			})
			await expectNoSchemaErrors(buf, 'chart-combo')
		}
	},
	{
		name: 'bar3D chart out-of-range v3DRotY/v3DPerspective clamp to valid ST_RotY/ST_Perspective',
		fn: async () => {
			// v3DRotY=400 (>360) and v3DPerspective=300 (>240) are out of range; the chart
			// option clamp (gen-objects.ts:296,298) must reset both to the default 30 before
			// the bar3d emit (gen-charts.ts:586). Without the clamp, <c:rotY val="400"/>
			// (>ST_RotY max 360) and <c:perspective val="300"/> (>ST_Perspective max 240)
			// are both schema-invalid. Clamp bounds == schema bounds exactly.
			const { buf, zip } = await build(p => {
				p.addSlide().addChart(p.charts.BAR3D, [
					{ name: 'Units', labels: ['X', 'Y', 'Z'], values: [8, 14, 6] }
				], { x: 1, y: 1, w: 6, h: 3, v3DRotY: 400, v3DPerspective: 300 })
			})
			// chartId is a module-global counter, so the entry is NOT necessarily chart1.xml;
			// locate the single chart entry generically.
			const chartPath = listEntries(zip).find(e => /^ppt\/charts\/chart\d+\.xml$/.test(e))
			assert(chartPath, `bar3D chart: expected a ppt/charts/chartN.xml entry (got: ${listEntries(zip).filter(e => e.includes('chart')).join(', ')})`)
			const xml = await readEntry(zip, chartPath)
			const view3D = (xml.match(/<c:view3D>[\s\S]*?<\/c:view3D>/) || [])[0] || ''
			const rotY = Number((view3D.match(/<c:rotY\s+val="(-?\d+)"/) || [])[1])
			// ST_RotY: 0 .. 360
			assert(rotY >= 0 && rotY <= 360, `v3DRotY: expected rotY in 0..360, got ${rotY} (view3D: ${view3D})`)
			assert(rotY === 30, `v3DRotY: expected out-of-range 400 to clamp to default 30, got ${rotY}`)
			const persp = Number((view3D.match(/<c:perspective\s+val="(-?\d+)"/) || [])[1])
			// ST_Perspective: 0 .. 240
			assert(persp >= 0 && persp <= 240, `v3DPerspective: expected perspective in 0..240, got ${persp} (view3D: ${view3D})`)
			assert(persp === 30, `v3DPerspective: expected out-of-range 300 to clamp to default 30, got ${persp}`)
			await expectNoSchemaErrors(buf, 'chart-bar3d-view3d-clamp')
		}
	},
	{
		name: 'chart layout out-of-range x/y/w/h are deleted so defaults are emitted',
		fn: async () => {
			// layout { x:2, y:-1, w:5, h:1.5 } is fully out of range (0..1). createChartObject
			// (gen-objects.ts:260-269) iterates ['x','y','w','h'] and DELETEs any value that is
			// NaN/<0/>1, so the emit (gen-charts.ts:596-599: <c:x val="${layout.x||0}"/> etc.)
			// falls back to the defaults x/y -> 0, w/h -> 1.
			// SCHEMA CAVEAT: c:x/c:y/c:w/c:h in CT_ManualLayout are CT_Double (val = unbounded
			// xsd:double), so an out-of-range value like x=2 is SCHEMA-VALID. Schema cannot
			// catch this regression (like GAP-3 rotation). The PRIMARY catch is the explicit
			// exact-value assert below; expectNoSchemaErrors is a secondary sanity check.
			const { buf, zip } = await build(p => {
				p.addSlide().addChart(p.charts.BAR, [
					{ name: 'Units', labels: ['X', 'Y', 'Z'], values: [8, 14, 6] }
				], { x: 1, y: 1, w: 6, h: 3, layout: { x: 2, y: -1, w: 5, h: 1.5 } })
			})
			// chartId is a module-global counter, so the entry is NOT necessarily chart1.xml;
			// locate the single chart entry generically.
			const chartPath = listEntries(zip).find(e => /^ppt\/charts\/chart\d+\.xml$/.test(e))
			assert(chartPath, `chart layout: expected a ppt/charts/chartN.xml entry (got: ${listEntries(zip).filter(e => e.includes('chart')).join(', ')})`)
			const xml = await readEntry(zip, chartPath)
			const manualLayout = (xml.match(/<c:manualLayout>[\s\S]*?<\/c:manualLayout>/) || [])[0] || ''
			assert(manualLayout, `chart layout: expected a <c:manualLayout> block (chart xml: ${xml.slice(0, 400)})`)
			const x = Number((manualLayout.match(/<c:x\s+val="(-?[\d.]+)"/) || [])[1])
			const y = Number((manualLayout.match(/<c:y\s+val="(-?[\d.]+)"/) || [])[1])
			const w = Number((manualLayout.match(/<c:w\s+val="(-?[\d.]+)"/) || [])[1])
			const h = Number((manualLayout.match(/<c:h\s+val="(-?[\d.]+)"/) || [])[1])
			// EXACT-VALUE regression-catch: out-of-range input was deleted -> defaults emitted.
			// If the delete safeguard regressed, the emit would be x=2, y=-1, w=5, h=1.5.
			assert(x === 0, `chart layout x: expected out-of-range 2 to be deleted -> default 0, got ${x} (manualLayout: ${manualLayout})`)
			assert(y === 0, `chart layout y: expected out-of-range -1 to be deleted -> default 0, got ${y} (manualLayout: ${manualLayout})`)
			assert(w === 1, `chart layout w: expected out-of-range 5 to be deleted -> default 1, got ${w} (manualLayout: ${manualLayout})`)
			assert(h === 1, `chart layout h: expected out-of-range 1.5 to be deleted -> default 1, got ${h} (manualLayout: ${manualLayout})`)
			await expectNoSchemaErrors(buf, 'chart-layout-default')
		}
	},
	{
		// GAP-7 (REGRESSION-GUARD): doughnut holeSize is now range-clamped in source.
		// gen-charts.ts emits a clamped value:
		//   const holeSizeVal = Math.max(10, Math.min(90, Math.round(rawHoleSize)))
		//   <c:holeSize val="${holeSizeVal}"/>
		// so holeSize:500 is clamped to <c:holeSize val="90"/>. The schema type
		// c:holeSize = ST_HoleSize is a restriction of xsd:unsignedByte (max 255; doughnut
		// restriction 10-90), so val="500" would be DEFINITIVELY schema-invalid -> the clamp
		// keeps the emission compliant. This fixture asserts BOTH the clamped raw emission
		// (val="90") and zero schema errors; it guards against re-regression of the clamp.
		name: 'doughnut chart out-of-range holeSize is clamped into ST_HoleSize range [10,90]',
		fn: async () => {
			const { buf, zip } = await build(p => {
				p.addSlide().addChart(p.charts.DOUGHNUT, [
					{ name: 'Share', labels: ['A', 'B', 'C', 'D'], values: [10, 20, 30, 40] }
				], { x: 1, y: 1, w: 5, h: 4, holeSize: 500 })
			})
			// Record the clamped emission the validator accepts. chartId is a
			// module-global counter, so locate the single chart entry generically (mem-7).
			const chartPath = listEntries(zip).find(e => /^ppt\/charts\/chart\d+\.xml$/.test(e))
			assert(chartPath, `holeSize: expected a ppt/charts/chartN.xml entry (got: ${listEntries(zip).filter(e => e.includes('chart')).join(', ')})`)
			const xml = await readEntry(zip, chartPath)
			const holeVal = (xml.match(/<c:holeSize\s+val="(-?[\d.]+)"/) || [])[1]
			// Proof the out-of-range value was clamped to the ST_HoleSize max (regression guard).
			assert(holeVal === '90', `holeSize: expected clamped emission <c:holeSize val="90"/>, got val="${holeVal}" (chart xml: ${xml.slice(0, 400)})`)
			// COMPLIANT-outcome assertion: passes now that holeSize is clamped into [10,90].
			await expectNoSchemaErrors(buf, 'chart-doughnut-holesize-oob')
		}
	},
	{
		// GAP-8 (REGRESSION GUARD): gradient stop position/transparency are clamped into
		// [0,100] before the ×1000 scale in genXmlGradientFill (gen-utils.ts):
		//   pos   = Math.round(Math.max(0, Math.min(100, stop.position || 0)) * 1000)
		//   alpha = Math.round(Math.max(0, Math.min(100, stop.transparency)) * 1000)
		// Both a:gs@pos and a:alpha@val are ST_PositiveFixedPercentage (0..100000), so an
		// out-of-range input like { position: 150, transparency: 150 } is clamped to
		// pos="100000" and <a:alpha val="100000"/> rather than the schema-invalid 150000.
		// This guards a NON-chart type (gradient fill), advancing the objective's "across
		// ALL types". The fixture asserts BOTH the clamped raw emission (re-regression
		// guard) AND schema validity — if the source clamp is removed, the raw 150000
		// re-appears and these asserts (and expectNoSchemaErrors) fail again.
		name: 'gradient stop out-of-range position/transparency clamped into ST_PositiveFixedPercentage [0,100]',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, {
					x: 1, y: 1, w: 4, h: 1,
					fill: {
						type: 'gradient', direction: 'horizontal',
						stops: [
							{ position: 0, color: '7C3AED' },
							{ position: 150, color: '38BDF8', transparency: 150 }
						]
					}
				})
			})
			// Slides are deterministic ppt/slides/slide1.xml (NOT the module-global chart counter).
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Proof the out-of-range values were clamped to the ST_PositiveFixedPercentage max (regression guard).
			assert(/<a:gs\s+pos="100000"/.test(xml), `gradient pos: expected clamped raw emission <a:gs pos="100000">, slide xml: ${xml.slice(0, 600)}`)
			assert(/<a:alpha\s+val="100000"\/>/.test(xml), `gradient alpha: expected clamped raw emission <a:alpha val="100000"/>, slide xml: ${xml.slice(0, 600)}`)
			// COMPLIANT-outcome assertion: passes now that pos/transparency are clamped into [0,100].
			await expectNoSchemaErrors(buf, 'gradient-stop-oob')
		}
	},
	{
		// Phase 1.1 — pattern (preset hatch) fill on shapes: `<a:pattFill prst="...">` with
		// `<a:fgClr>` and optional `<a:bgClr>`. Exercises 3 presets: one with backColor
		// (ltUpDiag), one WITHOUT backColor (cross → <a:bgClr> omitted), and a third (pct50)
		// with backColor. The fixture asserts BOTH the raw emission (REGRESSION-CATCH per the
		// run's RUNNER/ASSESSOR memory: a clean schema pass alone does NOT close the gap) AND
		// schema validity — if genXmlPatternFill regresses (wrong prst, dropped fgClr, or a
		// bgClr emitted for the no-background case) these exact-string asserts fail.
		name: 'pattern-fill shapes (3 presets, fg + optional bg) — a:pattFill',
		fn: async () => {
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 4, h: 1, fill: { type: 'pattern', preset: 'ltUpDiag', foreColor: '7C3AED', backColor: '1A1A24' } })
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 2.5, w: 4, h: 1, fill: { type: 'pattern', preset: 'cross', foreColor: 'FF0000' } })
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 4, w: 4, h: 1, fill: { type: 'pattern', preset: 'pct50', foreColor: '00B0B9', backColor: 'FFFFFF' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// REGRESSION-CATCH 1: the preset prst + foreground colour are emitted exactly as authored.
			assert(xml.includes('<a:pattFill prst="ltUpDiag">'), `pattern: expected <a:pattFill prst="ltUpDiag">, slide xml: ${xml.slice(0, 800)}`)
			assert(xml.includes('<a:fgClr><a:srgbClr val="7C3AED"/></a:fgClr>'), `pattern: expected <a:fgClr><a:srgbClr val="7C3AED"/>, slide xml: ${xml.slice(0, 800)}`)
			// REGRESSION-CATCH 2: all three presets are present.
			assert((xml.match(/<a:pattFill\s+prst="/g) || []).length === 3, `pattern: expected 3 <a:pattFill> elements, got ${(xml.match(/<a:pattFill\s+prst="/g) || []).length}`)
			assert(xml.includes('prst="cross"') && xml.includes('prst="pct50"'), `pattern: expected presets cross + pct50, slide xml: ${xml.slice(0, 800)}`)
			// REGRESSION-CATCH 3: backColor is opt-in — only the 2 shapes with backColor emit <a:bgClr> (cross omits it).
			assert((xml.match(/<a:bgClr>/g) || []).length === 2, `pattern: expected exactly 2 <a:bgClr> (cross omits bg), got ${(xml.match(/<a:bgClr>/g) || []).length}`)
			assert(xml.includes('<a:bgClr><a:srgbClr val="1A1A24"/></a:bgClr>'), `pattern: expected <a:bgClr><a:srgbClr val="1A1A24"/>, slide xml: ${xml.slice(0, 800)}`)
			// COMPLIANT-outcome assertion: a:pattFill with valid ST_PresetPatternVal prst is schema-clean.
			await expectNoSchemaErrors(buf, 'shape-patternfill')
		}
	},
	{
		// Phase 1.2 — picture/blip fill on shapes: `<a:blipFill>` with a registered `r:embed`
		// relationship (media part + slide `_rels` + `[Content_Types].xml` Default). Exercises
		// stretch (default) and tile sizing, plus optional transparency (`<a:alphaModFix>`). The
		// two shapes share ONE base64 PNG → dedupe to a single media part (two rels, one Target).
		// Per the run's RUNNER/ASSESSOR memory a clean schema pass alone does NOT close the gap:
		// the fixture asserts the raw emission (blipFill / blip r:embed / stretch vs tile / alphaModFix)
		// AND the media-rel + Content_Types Default presence, so a regression in the emitter or the
		// rel-registration (gen-objects/gen-xml) fails an exact assert.
		name: 'picture-fill shapes (stretch + tile + transparency) — a:blipFill',
		fn: async () => {
			const b64 =
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const dataUri = 'image/png;base64,' + b64
			const { buf, zip } = await build(p => {
				const s = p.addSlide()
					// stretch (default sizing omitted) + transparency
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 4, h: 2, fill: { type: 'image', data: dataUri, transparency: 20 } })
				// tile sizing
				s.addShape(p.shapes.RECTANGLE, { x: 1, y: 3.5, w: 4, h: 2, fill: { type: 'image', data: dataUri, sizing: 'tile' } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// REGRESSION-CATCH 1: both shapes emit a <a:blipFill> with an embedded blip relationship.
			assert((xml.match(/<a:blipFill>/g) || []).length === 2, `picture: expected 2 <a:blipFill>, got ${(xml.match(/<a:blipFill>/g) || []).length} — xml: ${xml.slice(0, 900)}`)
			assert((xml.match(/<a:blip r:embed="rId\d+">/g) || []).length === 2, `picture: expected 2 <a:blip r:embed="rIdN">, xml: ${xml.slice(0, 900)}`)
			// REGRESSION-CATCH 2: stretch (default) emits <a:stretch><a:fillRect/>; tile emits <a:tile ...>.
			assert(xml.includes('<a:stretch><a:fillRect/></a:stretch>'), `picture: expected <a:stretch><a:fillRect/></a:stretch> for default sizing, xml: ${xml.slice(0, 900)}`)
			assert(xml.includes('<a:tile tx="0" ty="0" sx="100000" sy="100000" algn="tl"/>'), `picture: expected <a:tile ...> for sizing:'tile', xml: ${xml.slice(0, 900)}`)
			// REGRESSION-CATCH 3: transparency:20 → <a:alphaModFix amt="80000"/> inside the blip.
			assert(xml.includes('<a:alphaModFix amt="80000"/>'), `picture: expected <a:alphaModFix amt="80000"/> (transparency 20), xml: ${xml.slice(0, 900)}`)
			// MEDIA-PIPELINE PROOF 1: the slide _rels carries image relationship(s) for the shape fills.
			const rels = await readEntry(zip, 'ppt/slides/_rels/slide1.xml.rels')
			const imgRels = (rels.match(/Type="[^"]*\/relationships\/image"/g) || [])
			// data-only images are not deduped (consistent with addImage(), which dedupes by `path`):
			// two data-URI fills → two image rels + two media parts.
			assert(imgRels.length === 2, `picture: expected 2 image <Relationship> in slide1.xml.rels, got ${imgRels.length} — rels: ${rels}`)
			assert(listEntries(zip).filter(e => /^ppt\/media\/image-[^/]+\.png$/.test(e)).length === 2, `picture: expected 2 media parts written, got entries: ${listEntries(zip).filter(e => e.includes('media')).join(', ')}`)
			// MEDIA-PIPELINE PROOF 2: [Content_Types].xml has the png Default extension override.
			const ct = await readEntry(zip, '[Content_Types].xml')
			assert(/<Default Extension="png" ContentType="image\/png"\/>/.test(ct), `picture: expected png Default in [Content_Types].xml — ct: ${ct.slice(0, 600)}`)
			// COMPLIANT-outcome assertion: the picture fill is schema-clean.
			await expectNoSchemaErrors(buf, 'shape-picturefill')
		}
	},
	{
		name: 'HTML entity decode in text runs (regression: extended named entities must not break OOXML schema)',
		fn: async () => {
			// Entity-decoded text containing ×, ·, —, ©, etc. must serialize cleanly as valid OOXML.
			const { parseHtml, textOf } = require('../src/bld/utils.cjs.js')
			const decoded = textOf(parseHtml('<p>Q&amp;A &middot; 7&times;</p>'))
			assert(decoded === 'Q&A \u00B7 7\u00D7', 'entity decode: expected "Q&A · 7×"; got: ' + JSON.stringify(decoded))
			const { buf, zip } = await build(p => {
				p.addSlide().addText(decoded, { x: 1, y: 1, w: 8, h: 1 })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// The & must be XML-escaped in the output, and · / × must appear as literal UTF-8 (not entity-encoded).
			assert(xml.includes('Q&amp;A'), 'entity-schema: & must be XML-escaped in output')
			assert(xml.includes('\u00B7'), 'entity-schema: middot (·) must appear as literal character')
			assert(xml.includes('\u00D7'), 'entity-schema: times (×) must appear as literal character')
			await expectNoSchemaErrors(buf, 'entity-decode-text')
		}
	},
	{
		name: 'parseCards sibling adoption: adopted card produces valid OOXML',
		fn: async () => {
			const { parseCards } = require('../src/bld/utils.cjs.js')
			const html = '<div style="display:grid"><div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>Card1</div></div><div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>Card2</div></div></div><div><svg viewBox="0 0 24 24"><path d="M2 2L22 22"/></svg><div>Adopted</div></div>'
			const cards = parseCards(html)
			assert(cards.length === 3, 'expected 3 cards (2 + 1 adopted); got ' + cards.length)
			const { buf } = await build(p => {
				const slide = p.addSlide()
				cards.forEach((c, i) => {
					slide.addCard({ x: i * 3, y: 0.5, w: 2.5, h: 2, title: c.title, icon: c.icon && c.icon.type === 'svg' ? { parts: c.icon.parts } : undefined })
				})
			})
			await expectNoSchemaErrors(buf, 'parseCards-sibling-adoption')
		}
	},
	{
		name: 'table border with transparency → valid OOXML',
		fn: async () => {
			const { buf } = await build(p => {
				const slide = p.addSlide()
				slide.addTable([[{ text: 'Cell', options: { border: { type: 'solid', color: 'FF0000', transparency: 50 } } }]])
			})
			await expectNoSchemaErrors(buf, 'table-border-transparency')
		}
	}
]
