
// Feature test — BorderProps.transparency emits correct <a:alpha> XML.

const { build, readEntry, assert } = require('./helpers')

async function tableCellXml(borderOpts) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		s.addTable([[{ text: 'Cell', options: { border: borderOpts } }]])
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
]
