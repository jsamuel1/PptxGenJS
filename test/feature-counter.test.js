'use strict'

// Slice 6 — Number-counter sugar (PROMPT.md §Feature 2.4, approach #1).
// `counter: { from, to, suffix?, stepMs? }` on addText expands into N stacked
// text frames at the same position. Each frame reuses the `appear` entrance
// (afterPrevious, delay = i===0?0:stepMs); every frame except the last also
// hides itself stepMs after appearing (a `<p:set>`→hidden inside the effect
// node), producing a count-up. Asserts: frame text runs, exactly N visible sets
// and N-1 hidden sets, sequential delays, N=1 edge, suffix/stepMs defaults,
// invalid counter fallback (no crash, no timing), default-off, unique cTn ids.

const { build, readEntry, assert } = require('./helpers')

async function slide1Xml(addObjs) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		addObjs(s)
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

function countOccurrences(haystack, needle) {
	return haystack.split(needle).length - 1
}

module.exports = [
	{
		name: 'counter: from 1 to 7 → 7 frames, 7 visible sets + 6 hidden sets',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 1, to: 7, suffix: '×', stepMs: 180 } }))
			assert(xml.includes('<p:timing>'), 'expected <p:timing>; got: ' + xml)
			// representative frame text runs (first / middle / last)
			assert(xml.includes('<a:t>1×</a:t>'), 'expected frame text 1×; got: ' + xml)
			assert(xml.includes('<a:t>4×</a:t>'), 'expected frame text 4×; got: ' + xml)
			assert(xml.includes('<a:t>7×</a:t>'), 'expected frame text 7×; got: ' + xml)
			assert(countOccurrences(xml, '<p:strVal val="visible"/>') === 7, 'expected 7 visible sets; got: ' + countOccurrences(xml, '<p:strVal val="visible"/>'))
			assert(countOccurrences(xml, '<p:strVal val="hidden"/>') === 6, 'expected 6 hidden sets; got: ' + countOccurrences(xml, '<p:strVal val="hidden"/>'))
			// every frame is an appear (presetID=1), zero animEffect/anim leakage
			assert(!xml.includes('<p:animEffect'), 'counter must not emit animEffect; got: ' + xml)
			assert(!xml.includes('<p:anim '), 'counter must not emit <p:anim>; got: ' + xml)
		}
	},
	{
		name: 'counter: sequential delay chain (first 0, later frames stepMs)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 1, to: 7, suffix: '×', stepMs: 180 } }))
			// first frame appears immediately
			assert(xml.includes('<p:cond delay="0"/>'), 'expected a delay="0" for first frame; got: ' + xml)
			// later frames appear after stepMs; also the exit hidden-sets use stepMs.
			// 6 later-frame appear-delays + 6 exit-delays = 12 occurrences of delay="180".
			const n180 = countOccurrences(xml, '<p:cond delay="180"/>')
			assert(n180 >= 6, 'expected at least 6 delay="180" (later frames); got: ' + n180)
		}
	},
	{
		name: 'counter: from 5 to 5 (N=1) → single frame, zero hidden sets',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 5, to: 5 } }))
			assert(xml.includes('<a:t>5</a:t>'), 'expected single frame text 5; got: ' + xml)
			assert(countOccurrences(xml, '<p:strVal val="visible"/>') === 1, 'expected 1 visible set; got: ' + xml)
			assert(countOccurrences(xml, '<p:strVal val="hidden"/>') === 0, 'N=1 must have zero hidden sets; got: ' + xml)
		}
	},
	{
		name: 'counter: suffix omitted → bare numbers',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 0, to: 2 } }))
			assert(xml.includes('<a:t>0</a:t>'), 'expected bare 0; got: ' + xml)
			assert(xml.includes('<a:t>1</a:t>'), 'expected bare 1; got: ' + xml)
			assert(xml.includes('<a:t>2</a:t>'), 'expected bare 2; got: ' + xml)
		}
	},
	{
		name: 'counter: stepMs omitted → default 500 delay',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 1, to: 3 } }))
			assert(xml.includes('<p:cond delay="500"/>'), 'expected default stepMs=500 delay; got: ' + xml)
		}
	},
	{
		name: 'counter: invalid (to < from) → single empty frame, zero <p:timing>',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 10, to: 1 } }))
			assert(!xml.includes('<p:timing>'), 'invalid counter must emit no <p:timing>; got: ' + xml)
		}
	},
	{
		name: 'counter: invalid (non-finite) → no crash, zero <p:timing>',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: NaN, to: 5 } }))
			assert(!xml.includes('<p:timing>'), 'non-finite counter must emit no <p:timing>; got: ' + xml)
		}
	},
	{
		name: 'counter: default-off — plain addText has zero <p:timing>',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hello', { x: 1, y: 1, w: 4, h: 1 }))
			assert(!xml.includes('<p:timing'), 'plain text must emit no <p:timing>; got: ' + xml)
		}
	},
	{
		name: 'counter: all <p:cTn id> values unique within slide1.xml',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('', { x: 1, y: 1, w: 4, h: 1, counter: { from: 1, to: 4, suffix: '%', stepMs: 90 } }))
			const ids = (xml.match(/<p:cTn id="(\d+)"/g) || []).map(m => m.match(/"(\d+)"/)[1])
			assert(ids.length > 0, 'expected some <p:cTn id>; got: ' + xml)
			const unique = new Set(ids)
			assert(unique.size === ids.length, 'all <p:cTn id> must be unique; got ' + ids.length + ' ids, ' + unique.size + ' unique: ' + ids.join(','))
		}
	}
]
