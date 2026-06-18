
// Feature test — BorderProps.transparency emits correct <a:alpha> XML.

const { build, readEntry, assert } = require('./helpers')

async function tableCellXml(borderOpts) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		s.addTable([[{ text: 'Cell', options: { border: borderOpts } }]])
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

async function shapeLineXml(lineOpts) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		s.addShape(p.shapes.RECTANGLE, { x: 1, y: 1, w: 2, h: 1, fill: 'F4F4F8', line: lineOpts })
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

module.exports = [
	{
		name: 'border transparency: 50 → emits <a:alpha val="50000"/>',
		fn: async () => {
			const xml = await tableCellXml({ type: 'solid', color: 'FF0000', transparency: 50 })
			assert(xml.includes('<a:alpha val="50000"/>'), 'expected <a:alpha val="50000"/>; got: ' + xml.slice(0, 500))
		}
	},
	{
		name: 'border transparency: 0 → no alpha element',
		fn: async () => {
			const xml = await tableCellXml({ type: 'solid', color: 'FF0000', transparency: 0 })
			assert(!xml.includes('<a:alpha'), 'expected no <a:alpha> for transparency:0; got: ' + xml.slice(0, 500))
		}
	},
	{
		name: 'border transparency: undefined → no alpha element',
		fn: async () => {
			const xml = await tableCellXml({ type: 'solid', color: 'FF0000' })
			assert(!xml.includes('<a:alpha'), 'expected no <a:alpha> for undefined transparency; got: ' + xml.slice(0, 500))
		}
	},
	{
		name: 'border transparency: 150 → clamped to 100, emits <a:alpha val="0"/>',
		fn: async () => {
			const xml = await tableCellXml({ type: 'solid', color: 'FF0000', transparency: 150 })
			assert(xml.includes('<a:alpha val="0"/>'), 'expected <a:alpha val="0"/> for clamped 150; got: ' + xml.slice(0, 500))
		}
	},
	{
		name: 'border transparency: -10 → clamped to 0, no alpha element',
		fn: async () => {
			const xml = await tableCellXml({ type: 'solid', color: 'FF0000', transparency: -10 })
			assert(!xml.includes('<a:alpha'), 'expected no <a:alpha> for clamped -10; got: ' + xml.slice(0, 500))
		}
	},
	// Shape line transparency goes through genXmlColorSelection (gen-utils.ts:301) rather than
	// borderAlphaXml directly; these lock the clamp + default-off behaviour on that path too (ADR-0005/0006).
	{
		name: 'shape line transparency: 60 → emits <a:alpha val="40000"/>',
		fn: async () => {
			const xml = await shapeLineXml({ color: '7C3AED', width: 4, transparency: 60 })
			assert(xml.includes('<a:alpha val="40000"/>'), 'expected <a:alpha val="40000"/>; got: ' + xml.slice(0, 800))
		}
	},
	{
		name: 'shape line transparency: unset → byte-identical, no alpha element',
		fn: async () => {
			const xml = await shapeLineXml({ color: '7C3AED', width: 4 })
			assert(!xml.includes('<a:alpha'), 'expected no <a:alpha> for unset line transparency; got: ' + xml.slice(0, 800))
		}
	},
	{
		name: 'shape line transparency: 150 → clamped to 100, emits <a:alpha val="0"/> (no invalid negative val)',
		fn: async () => {
			const xml = await shapeLineXml({ color: '7C3AED', width: 4, transparency: 150 })
			assert(xml.includes('<a:alpha val="0"/>'), 'expected clamped <a:alpha val="0"/>; got: ' + xml.slice(0, 800))
			assert(!/<a:alpha val="-/.test(xml), 'must not emit a negative alpha val; got: ' + xml.slice(0, 800))
		}
	},
]
