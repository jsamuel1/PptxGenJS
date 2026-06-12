'use strict'

// Feature: Fragment animation timing-tree guarantees (docs/features/feature-fragment-animations.md).
// Pins output behaviour: N ordered afterPrevious steps produce N sequential timing nodes
// with unique cTn ids; entrance+exit coexist; emphasis mid-chain doesn't break ordering.

const { build, readEntry, assert } = require('./helpers')

async function slide1Xml(addObjs) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		addObjs(s)
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

function allCtnIds(xml) {
	return [...xml.matchAll(/<p:cTn[^>]* id="(\d+)"/g)].map(m => m[1])
}

module.exports = [
	{
		name: 'fragment: N ordered afterPrevious steps → N sequential timing nodes with unique cTn ids',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('A', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
				s.addText('B', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
				s.addText('C', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
			})
			// 3 build-step wrappers
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 3, 'expected 3 afterEffect wrappers')
			// 3 members
			assert((xml.match(/nodeType="withEffect"/g) || []).length === 3, 'expected 3 withEffect members')
			// 3 entrance presets
			assert((xml.match(/presetClass="entr"/g) || []).length === 3, 'expected 3 presetClass="entr"')
			// all cTn ids unique
			const ids = allCtnIds(xml)
			assert(ids.length === new Set(ids).size, 'cTn ids must be unique; got: ' + ids.join(','))
		},
	},
	{
		name: 'fragment: entrance + exit in one timing tree — no duplicate cTn ids',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('Enter', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
				s.addText('Exit', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeOut', trigger: 'afterPrevious' } })
			})
			// both preset classes present
			assert(xml.includes('presetClass="entr"'), 'expected presetClass="entr"')
			assert(xml.includes('presetClass="exit"'), 'expected presetClass="exit"')
			// 2 build-step wrappers
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 2, 'expected 2 afterEffect wrappers')
			// all cTn ids unique
			const ids = allCtnIds(xml)
			assert(ids.length === new Set(ids).size, 'cTn ids must be unique; got: ' + ids.join(','))
		},
	},
	{
		name: 'fragment: colorPulse emphasis between entrances does not break the chain',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('A', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
				s.addText('B', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'colorPulse', trigger: 'afterPrevious' } })
				s.addText('C', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'afterPrevious' } })
			})
			// 3 build-step wrappers — emphasis doesn't collapse steps
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 3, 'expected 3 afterEffect wrappers')
			// entrance + emphasis preset classes
			assert((xml.match(/presetClass="entr"/g) || []).length === 2, 'expected 2 presetClass="entr"')
			assert((xml.match(/presetClass="emph"/g) || []).length === 1, 'expected 1 presetClass="emph"')
			// all cTn ids unique
			const ids = allCtnIds(xml)
			assert(ids.length === new Set(ids).size, 'cTn ids must be unique; got: ' + ids.join(','))
		},
	},
]
