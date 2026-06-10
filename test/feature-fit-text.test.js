'use strict'

// Feature: fit:'fill' (alias 'grow') — scales text UP to fill the box width/height.
// Verifies font size computation and regression for fit:'shrink'.

const { build, readEntry, assert } = require('./helpers')

async function slide1Xml(addObjs) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		addObjs(s)
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

module.exports = [
	{
		name: "fit:'fill' with short text in wide box produces large fontSize",
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('Hi', { x: 0, y: 0, w: 10, h: 2, fit: 'fill' })
			})
			// sz is in hundredths of a point; 1800 = 18pt
			const match = xml.match(/sz="(\d+)"/)
			assert(match, 'expected sz attribute in XML')
			const sz = parseInt(match[1], 10)
			assert(sz > 1800, 'expected sz > 1800 (18pt) for short text in wide box, got ' + sz)
		},
	},
	{
		name: "fit:'fill' with long text constrains fontSize to box width",
		fn: async () => {
			const longText = 'This is a long sentence that should constrain the font size down.'
			const xml = await slide1Xml(s => {
				s.addText(longText, { x: 0, y: 0, w: 5, h: 2, fit: 'fill' })
			})
			const match = xml.match(/sz="(\d+)"/)
			assert(match, 'expected sz attribute in XML')
			const sz = parseInt(match[1], 10)
			// Should be bounded — not huge (height would allow 144pt=14400, but width constrains it)
			assert(sz < 14400, 'expected sz < 14400 for long text, got ' + sz)
			assert(sz >= 100, 'expected sz >= 100 (1pt minimum), got ' + sz)
		},
	},
	{
		name: "fit:'shrink' still emits normAutofit (regression)",
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('Shrink me', { x: 0, y: 0, w: 5, h: 1, fit: 'shrink' })
			})
			assert(xml.includes('normAutofit'), 'expected normAutofit in XML for fit:shrink')
		},
	},
]
