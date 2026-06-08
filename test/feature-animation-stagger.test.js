'use strict'

// Feature: Animation Stagger / Auto-Grouping (docs/feature-animation-stagger.md).
// `animation.group` is sugar over `trigger`: same group => withPrevious members of one
// build step; a different group => a new afterPrevious step. `animation.stagger` applies a
// cumulative per-item delay (N * stagger) within a group. Resolution happens in
// genXmlTiming() before the existing build-step logic; no new OOXML elements are introduced.

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
		name: 'stagger: two items in same group → one build step (afterEffect) with two withEffect members',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('A', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', group: 1 } })
				s.addText('B', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', group: 1 } })
			})
			// exactly one build-step wrapper (one group => one step)
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 1, 'expected exactly 1 build-step wrapper; got: ' + xml)
			// two members inside the step (both withEffect, both fadeIn presetID=10)
			assert((xml.match(/nodeType="withEffect"/g) || []).length === 2, 'expected 2 withEffect members; got: ' + xml)
			assert((xml.match(/presetID="10"/g) || []).length === 2, 'expected 2 fadeIn members; got: ' + xml)
		},
	},
	{
		name: 'stagger: cumulative delays 0/100/200 within a single group',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('C1', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', group: 2, stagger: 100 } })
				s.addText('C2', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear', group: 2, stagger: 100 } })
				s.addText('C3', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'appear', group: 2, stagger: 100 } })
			})
			// one step (one group), three members
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 1, 'expected exactly 1 build-step wrapper; got: ' + xml)
			assert((xml.match(/nodeType="withEffect"/g) || []).length === 3, 'expected 3 withEffect members; got: ' + xml)
			// member stagger delays: 0, 100, 200
			assert(xml.includes('<p:cond delay="100"/>'), 'expected staggered member delay=100; got: ' + xml)
			assert(xml.includes('<p:cond delay="200"/>'), 'expected staggered member delay=200; got: ' + xml)
		},
	},
	{
		name: 'stagger: different groups → two sequential afterPrevious steps',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('X', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', group: 1 } })
				s.addText('Y', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', group: 2 } })
			})
			// two distinct build steps (one per group)
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 2, 'expected 2 build-step wrappers; got: ' + xml)
			assert((xml.match(/nodeType="withEffect"/g) || []).length === 2, 'expected 2 members (one per step); got: ' + xml)
		},
	},
	{
		name: 'stagger: explicit trigger without group is byte-for-byte unchanged (backwards-compat)',
		fn: async () => {
			const withGroupKey = await slide1Xml(s => {
				s.addText('A', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'withPrevious' } })
			})
			// A lone explicit-trigger animation must still emit timing exactly as before:
			// no group resolution kicks in, so trigger 'withPrevious' opens its own step (withEffect wrapper).
			assert(withGroupKey.includes('<p:timing>'), 'expected <p:timing>; got: ' + withGroupKey)
			assert(withGroupKey.includes('nodeType="withEffect"'), 'expected withEffect wrapper for lone withPrevious; got: ' + withGroupKey)
			assert(!withGroupKey.includes('nodeType="afterEffect"'), 'lone withPrevious must NOT become afterEffect; got: ' + withGroupKey)
		},
	},
	{
		name: 'stagger: grouped then ungrouped object resets the run',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('G1a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', group: 1 } })
				s.addText('G1b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', group: 1 } })
				s.addText('U', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'appear' } })
			})
			// group 1 => one afterEffect step (with 2 withEffect members),
			// ungrouped 'appear' => its own afterPrevious step (defaults to afterPrevious)
			assert((xml.match(/nodeType="afterEffect"/g) || []).length === 2, 'expected 2 build steps (group + ungrouped); got: ' + xml)
			assert((xml.match(/nodeType="withEffect"/g) || []).length === 3, 'expected 3 members total; got: ' + xml)
		},
	},
]
