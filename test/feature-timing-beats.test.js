'use strict'

// Slice 1 — genXmlTiming Sequential Beats (PROMPT.md §"Critical Bug Fix").
// Verifies that animated objects are grouped into BUILD STEPS by trigger and each
// step is its own <p:par> directly under <p:seq nodeType="mainSeq"> (the container
// that actually sequences in PowerPoint), NOT all crammed as siblings inside one
// shared parallel container. Trigger grouping rule:
//   afterPrevious / onClick → start a NEW build step
//   withPrevious            → join the CURRENT build step
// The step wrapper <p:cTn> carries the lead trigger's nodeType
// (afterEffect/clickEffect/withEffect) and consumes the lead member's delay; members
// inside the step are nodeType="withEffect".

const { build, readEntry, assert } = require('./helpers')

async function slide1Xml(addObjs) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		addObjs(s)
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

// Inner XML of the mainSeq childTnLst (where build steps live as direct children).
function mainSeqInner(xml) {
	const marker = 'nodeType="mainSeq"><p:childTnLst>'
	const i = xml.indexOf(marker)
	assert(i !== -1, 'mainSeq childTnLst marker not found; got: ' + xml)
	return xml.slice(i + marker.length)
}

// Count build-step WRAPPER <p:cTn> nodes. Wrappers look like
// `<p:cTn id="N" fill="hold" nodeType="afterEffect|withEffect|clickEffect">`.
// Member effect nodes are excluded because they carry `... grpId="0" nodeType=...`
// (presetID/presetClass/grpId sit between `fill="hold"` and `nodeType`).
function stepWrapperCount(xml) {
	return (xml.match(/fill="hold" nodeType="(?:afterEffect|withEffect|clickEffect)"/g) || []).length
}

// Count member effect nodes (one per animated object).
function memberCount(xml) {
	return (xml.match(/presetClass="entr"/g) || []).length
}

module.exports = [
	{
		name: 'beats: 3 afterPrevious shapes (delay 200) → 3 separate build steps under mainSeq, not one shared parallel container',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'afterPrevious', delay: 200 } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'afterPrevious', delay: 200 } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'afterPrevious', delay: 200 } })
			})
			// 3 build steps, each its own afterEffect wrapper (the broken structure had exactly ONE).
			assert(stepWrapperCount(xml) === 3, 'expected 3 build-step wrappers; got ' + stepWrapperCount(xml) + ': ' + xml)
			assert((xml.match(/fill="hold" nodeType="afterEffect"/g) || []).length === 3,
				'all 3 steps must be afterEffect; got: ' + xml)
			assert(memberCount(xml) === 3, 'expected 3 member effect nodes; got: ' + xml)
			// Each step's wrapper consumes the 200ms gap.
			assert((xml.match(/nodeType="afterEffect"><p:stCondLst><p:cond delay="200"\/>/g) || []).length === 3,
				'each build step wrapper must carry delay="200"; got: ' + xml)
			// Build steps are DIRECT children of mainSeq: first child is a <p:par> step wrapper.
			assert(/^<p:par><p:cTn id="\d+" fill="hold" nodeType="afterEffect">/.test(mainSeqInner(xml)),
				'first mainSeq child must be a <p:par> build step; got: ' + mainSeqInner(xml).slice(0, 120))
		}
	},
	{
		name: 'beats: 1 afterPrevious + 1 withPrevious + 1 afterPrevious → 2 build steps (first groups two members)',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'afterPrevious' } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'withPrevious' } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn', trigger: 'afterPrevious' } })
			})
			assert(stepWrapperCount(xml) === 2, 'withPrevious must join the current step → 2 build steps; got ' + stepWrapperCount(xml) + ': ' + xml)
			assert(memberCount(xml) === 3, 'expected 3 member effect nodes across the 2 steps; got: ' + xml)
			// Both step wrappers are afterEffect (lead triggers); members are withEffect.
			assert((xml.match(/fill="hold" nodeType="afterEffect"/g) || []).length === 2, 'expected 2 afterEffect wrappers; got: ' + xml)
			assert((xml.match(/grpId="0" nodeType="withEffect"/g) || []).length === 3, 'all 3 members must be withEffect; got: ' + xml)
		}
	},
	{
		name: 'beats: odometer counter 1→7 (withPrevious, 180ms) → ONE parallel build step with cumulative delays',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 1, to: 7, suffix: '×', stepMs: 180 } }))
			// Odometer frames live in ONE parallel build step (withPrevious), NOT 7 separate steps.
			// afterPrevious would split each frame into its own step and break the count-up.
			assert(stepWrapperCount(xml) === 1, 'odometer must expand to ONE build step; got ' + stepWrapperCount(xml) + ': ' + xml)
			assert((xml.match(/fill="hold" nodeType="withEffect"/g) || []).length === 1, 'the single step wrapper must be withEffect; got: ' + xml)
			// 7 frames, each its own entrance member, all withEffect inside the one step.
			assert(memberCount(xml) === 7, 'expected 7 member effect nodes (one per frame); got: ' + xml)
			assert((xml.match(/grpId="0" nodeType="withEffect"/g) || []).length === 7, 'all 7 frames must be withEffect members; got: ' + xml)
			// Members appear at CUMULATIVE delays from the container start: 0,180,360,540,720,900,1080.
			;[0, 180, 360, 540, 720, 900, 1080].forEach(d => {
				assert(xml.includes(`grpId="0" nodeType="withEffect"><p:stCondLst><p:cond delay="${d}"/>`),
					`expected an odometer frame at cumulative delay="${d}"; got: ` + xml)
			})
			// 6 of 7 frames carry an exit (hide) block inside mainSeq; the last frame stays visible.
			// (7 additional initial-hide sets appear before <p:seq> — the static-export fix.)
			const seqIdx = xml.indexOf('<p:seq ')
			const afterSeq = xml.substring(seqIdx)
			assert((afterSeq.match(/<p:strVal val="hidden"\/>/g) || []).length === 6, 'expected 6 frame-exit (hidden) blocks in mainSeq; got: ' + xml)
		}
	},
	{
		name: 'beats: mixed triggers (onClick / withPrevious / afterPrevious) group into sequential build steps',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', trigger: 'onClick' } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear', trigger: 'withPrevious' } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
				s.addText('d', { x: 1, y: 4, w: 4, h: 1, animation: { type: 'appear', trigger: 'withPrevious' } })
				s.addText('e', { x: 1, y: 5, w: 4, h: 1, animation: { type: 'appear', trigger: 'afterPrevious' } })
			})
			// step1 = [onClick, withPrevious], step2 = [afterPrevious, withPrevious], step3 = [afterPrevious]
			assert(stepWrapperCount(xml) === 3, 'expected 3 distinct build steps; got ' + stepWrapperCount(xml) + ': ' + xml)
			assert(memberCount(xml) === 5, 'expected 5 member effect nodes; got: ' + xml)
			// onClick lead → clickEffect wrapper waiting indefinitely for a click.
			assert(xml.includes('fill="hold" nodeType="clickEffect"><p:stCondLst><p:cond delay="indefinite"/>'),
				'onClick step must be a clickEffect wrapper with indefinite start; got: ' + xml)
			assert((xml.match(/fill="hold" nodeType="afterEffect"/g) || []).length === 2, 'expected 2 afterEffect step wrappers; got: ' + xml)
		}
	},
	{
		name: 'beats: default-off — no <p:timing> and no build steps when nothing animated',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('plain', { x: 1, y: 1, w: 4, h: 1 }))
			assert(!xml.includes('<p:timing'), 'unanimated slide must emit no <p:timing>; got: ' + xml)
			assert(stepWrapperCount(xml) === 0, 'unanimated slide must have no build-step wrappers; got: ' + xml)
		}
	}
]
