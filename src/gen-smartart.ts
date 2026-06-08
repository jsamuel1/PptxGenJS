/**
 * PptxGenJS: SmartArt / Diagram (`dgm:*`, `dsp:*`) XML generators.
 *
 * Minimal subset: a flat array of strings rendered as a `list` (vertical stack) or
 * `process` (horizontal row) diagram. Each `addSmartArt(...)` call emits FIVE linked
 * `/ppt/diagrams/` parts:
 *   - data{N}.xml      `<dgm:dataModel>`  (point/connection model + dsp:dataModelExt → drawing)
 *   - layout{N}.xml    `<dgm:layoutDef>`  (minimal valid layout definition)
 *   - quickStyle{N}.xml`<dgm:styleDef>`   (minimal valid style definition)
 *   - colors{N}.xml    `<dgm:colorsDef>`  (minimal valid colors definition)
 *   - drawing{N}.xml   `<dsp:drawing>`    (precomputed drawing cache so it renders out-of-the-box)
 *
 * The graphicFrame on the slide (gen-xml.ts `case SLIDE_OBJECT_TYPES.diagram`) references the
 * data/layout/quickStyle/colors parts via four slide relationships. The drawing part is referenced
 * by a FIFTH slide relationship (the MS `diagramDrawing` rel type); the data model's `extLst` carries
 * `<dsp:dataModelExt relId="rIdN">` pointing at that drawing slide-rel rId. (The drawing rel must live
 * on the slide, not as a data-part sub-rel — the OOXML SDK rejects a `diagramDrawing` rel on the data
 * part — so no `/ppt/diagrams/_rels/data{N}.xml.rels` file is written.)
 */

import { CRLF } from './core-enums'
import { inch2Emu, encodeXmlEntities } from './gen-utils'

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const DGM_NS = 'http://schemas.openxmlformats.org/drawingml/2006/diagram'
const DSP_NS = 'http://schemas.microsoft.com/office/drawing/2008/diagram'
const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const DSP_EXT_URI = 'http://schemas.microsoft.com/office/drawing/2008/diagram'

export interface DiagramItem {
	layout: 'list' | 'process'
	items: string[]
	color?: string
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF

/** Per-node modelId used in BOTH the data model and the drawing cache (string ids 1..N; doc = "0"). */
function nodeModelId (i: number): string {
	return String(i + 1)
}

/**
 * data{N}.xml — `<dgm:dataModel>`: one `doc` point + one `node` point per item, each linked from the
 * doc via a `parOf` connection. The `extLst` carries `<dsp:dataModelExt relId="rIdN">` pointing at the
 * drawing cache (resolved via the drawing's slide relationship — `drawingRid`).
 */
export function makeXmlDiagramData (dgm: DiagramItem, drawingRid: number): string {
	const items = dgm.items || []
	let pts = `<dgm:pt modelId="0" type="doc"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t></dgm:pt>`
	let cxns = ''
	items.forEach((txt, i) => {
		const mid = nodeModelId(i)
		pts += `<dgm:pt modelId="${mid}" type="node"><dgm:prSet/><dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${encodeXmlEntities(txt)}</a:t></a:r></a:p></dgm:t></dgm:pt>`
		// Connection: doc (srcId="0") -> node. modelId must be unique; offset past node ids.
		cxns += `<dgm:cxn modelId="${1000 + i}" type="parOf" srcId="0" destId="${mid}" srcOrd="${i}" destOrd="0"/>`
	})
	let xml = XML_HEAD
	xml += `<dgm:dataModel xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">`
	xml += `<dgm:ptLst>${pts}</dgm:ptLst>`
	xml += `<dgm:cxnLst>${cxns}</dgm:cxnLst>`
	xml += '<dgm:bg/><dgm:whole/>'
	xml += '<dgm:extLst>'
	xml += `<a:ext uri="${DSP_EXT_URI}">`
	xml += `<dsp:dataModelExt xmlns:dsp="${DSP_NS}" relId="rId${drawingRid}" minVer="${DGM_NS}"/>`
	xml += '</a:ext>'
	xml += '</dgm:extLst>'
	xml += '</dgm:dataModel>'
	return xml
}

/** layout{N}.xml — `<dgm:layoutDef>`: minimal valid layout (exactly one `<dgm:layoutNode>`). */
export function makeXmlDiagramLayout (dgm: DiagramItem): string {
	const uniqueId = `urn:pptxgenjs/diagram/${dgm.layout}`
	let xml = XML_HEAD
	xml += `<dgm:layoutDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="${uniqueId}">`
	xml += `<dgm:title val=""/><dgm:desc val=""/>`
	xml += '<dgm:catLst/>'
	xml += '<dgm:sampData/><dgm:styleData/><dgm:clrData/>'
	xml += '<dgm:layoutNode name="root"/>'
	xml += '</dgm:layoutDef>'
	return xml
}

/** quickStyle{N}.xml — `<dgm:styleDef>`: minimal valid style definition. */
export function makeXmlDiagramQuickStyle (): string {
	let xml = XML_HEAD
	xml += `<dgm:styleDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:pptxgenjs/diagram/style">`
	xml += '<dgm:title val=""/><dgm:desc val=""/>'
	xml += '<dgm:catLst/>'
	xml += '<dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d>'
	xml += '<dgm:styleLbl name="node0"><dgm:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></dgm:scene3d><dgm:sp3d/><dgm:txPr/></dgm:styleLbl>'
	xml += '</dgm:styleDef>'
	return xml
}

/** colors{N}.xml — `<dgm:colorsDef>`: minimal valid colors definition. */
export function makeXmlDiagramColors (): string {
	let xml = XML_HEAD
	xml += `<dgm:colorsDef xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" uniqueId="urn:pptxgenjs/diagram/colors">`
	xml += '<dgm:title val=""/><dgm:desc val=""/>'
	xml += '<dgm:catLst/>'
	xml += '</dgm:colorsDef>'
	return xml
}

/**
 * drawing{N}.xml — `<dsp:drawing>`: precomputed drawing cache. One `<dsp:sp>` per item positioned
 * evenly along a row (process) or column (list), filling the frame `cx`×`cy` (EMU). Each shape's
 * `modelId` matches the corresponding data-model node `modelId`.
 */
export function makeXmlDiagramDrawing (dgm: DiagramItem, w: number, h: number): string {
	const items = dgm.items || []
	const n = Math.max(1, items.length)
	const cx = Math.round(inch2Emu(w))
	const cy = Math.round(inch2Emu(h))
	const fill = (dgm.color || '4472C4').replace(/^#/, '')
	const isProcess = dgm.layout === 'process'
	// Gap between boxes = 12% of a cell; box gets the remaining 88%.
	const gapFrac = 0.12

	let shapes = ''
	items.forEach((txt, i) => {
		const mid = nodeModelId(i)
		let bx: number, by: number, bw: number, bh: number
		if (isProcess) {
			const cell = cx / n
			const gap = Math.round(cell * gapFrac)
			bx = Math.round(i * cell) + Math.round(gap / 2)
			by = 0
			bw = Math.round(cell) - gap
			bh = cy
		} else {
			const cell = cy / n
			const gap = Math.round(cell * gapFrac)
			bx = 0
			by = Math.round(i * cell) + Math.round(gap / 2)
			bw = cx
			bh = Math.round(cell) - gap
		}
		if (bw < 1) bw = 1
		if (bh < 1) bh = 1
		shapes += `<dsp:sp modelId="${mid}">`
		shapes += `<dsp:nvSpPr><dsp:cNvPr id="${i + 1}" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>`
		shapes += '<dsp:spPr>'
		shapes += `<a:xfrm><a:off x="${bx}" y="${by}"/><a:ext cx="${bw}" cy="${bh}"/></a:xfrm>`
		shapes += '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
		shapes += `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`
		shapes += '</dsp:spPr>'
		shapes += '<dsp:txBody>'
		shapes += '<a:bodyPr/><a:lstStyle/>'
		shapes += `<a:p><a:r><a:t>${encodeXmlEntities(txt)}</a:t></a:r></a:p>`
		shapes += '</dsp:txBody>'
		shapes += '</dsp:sp>'
	})

	let xml = XML_HEAD
	xml += `<dsp:drawing xmlns:dsp="${DSP_NS}" xmlns:dgm="${DGM_NS}" xmlns:a="${A_NS}" xmlns:r="${R_NS}">`
	xml += '<dsp:spTree>'
	xml += '<dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr>'
	xml += '<dsp:grpSpPr/>'
	xml += shapes
	xml += '</dsp:spTree>'
	xml += '</dsp:drawing>'
	return xml
}
