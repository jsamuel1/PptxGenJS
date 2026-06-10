'use strict'

const { build, readEntry, assert } = require('./helpers')

module.exports = [
	{
		name: 'morph: transition:{type:"morph"} emits <p14:morph in slide XML',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addText('Hello', { x: 1, y: 1, w: 4, h: 1 })
				s.transition = { type: 'morph' }
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(xml.includes('<p14:morph'), 'expected <p14:morph in slide XML')
			assert(xml.includes('option="byObject"'), 'expected default option="byObject"')
			assert(xml.includes('<p:transition'), 'expected <p:transition wrapper')
		},
	},
	{
		name: 'morph: shapes with same morphId on consecutive slides emit matching cNvPr name',
		fn: async () => {
			const { zip } = await build(p => {
				const s1 = p.addSlide()
				s1.addShape('rect', { x: 1, y: 1, w: 2, h: 2, morphId: 'box1' })
				const s2 = p.addSlide()
				s2.addShape('rect', { x: 3, y: 3, w: 2, h: 2, morphId: 'box1' })
				s2.transition = { type: 'morph' }
			})
			const xml1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xml2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(xml1.includes('name="box1"'), 'slide1 should have cNvPr name="box1"')
			assert(xml2.includes('name="box1"'), 'slide2 should have cNvPr name="box1"')
		},
	},
	{
		name: 'morph: deck with no morph transitions has no p14:morph in XML (regression)',
		fn: async () => {
			const { zip } = await build(p => {
				const s = p.addSlide()
				s.addText('No morph', { x: 1, y: 1, w: 4, h: 1 })
				s.transition = { type: 'fade' }
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert(!xml.includes('p14:morph'), 'should NOT contain p14:morph for non-morph transition')
		},
	},
]
