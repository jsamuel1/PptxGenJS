'use strict'

// Slice 3 — Shape entrance animations: appear + fadeIn (PROMPT.md §Feature 2.1/2.2).
// Asserts the emitted `<p:timing>` OOXML in ppt/slides/slideN.xml: the visibility
// <p:set> payload, the fade <p:animEffect> for fadeIn, per-shape stagger via
// <p:cond delay>, default-off (no <p:timing> when nothing animated), multi-slide
// isolation, unique <p:cTn id> values, position (after </p:clrMapOvr>, before
// </p:sld>), and spid = object's <p:cNvPr id> (idx + 2).

const { build, readEntry, assert } = require('./helpers')

// Build a single-slide deck via a callback; return slide1.xml.
async function slide1Xml(addObjs) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		addObjs(s)
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

module.exports = [
	{
		name: 'animation: single appear → <p:set> visibility only, no <p:animEffect>',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear' } }))
			assert(xml.includes('<p:timing>'), 'expected <p:timing>; got: ' + xml)
			assert(xml.includes('<p:attrName>style.visibility</p:attrName>'), 'expected visibility set; got: ' + xml)
			assert(xml.includes('<p:strVal val="visible"/>'), 'expected visible strVal; got: ' + xml)
			assert(!xml.includes('<p:animEffect'), 'appear must NOT emit animEffect; got: ' + xml)
			assert(xml.includes('presetID="1"'), 'appear presetID must be 1; got: ' + xml)
		}
	},
	{
		name: 'animation: single fadeIn custom duration 420 → <p:animEffect filter="fade"> dur="420"',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', duration: 420 } }))
			assert(xml.includes('<p:animEffect transition="in" filter="fade">'), 'expected fade animEffect; got: ' + xml)
			assert(/<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="\d+" dur="420"\/>/.test(xml),
				'fade animEffect must carry dur="420"; got: ' + xml)
			assert(xml.includes('presetID="10"'), 'fadeIn presetID must be 10; got: ' + xml)
		}
	},
	{
		name: 'animation: fadeIn default duration → dur="500"',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn' } }))
			assert(/<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="\d+" dur="500"\/>/.test(xml),
				'default fadeIn duration must be 500; got: ' + xml)
		}
	},
	{
		name: 'animation: staggered fadeIn delays 0/90/180 → three <p:cond delay="..">',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn', delay: 0 } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn', delay: 90 } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn', delay: 180 } })
			})
			// Each afterPrevious shape is its own build step; the per-step wrapper
			// (nodeType="afterEffect") carries the stagger delay, members are withEffect.
			assert(xml.includes('fill="hold" nodeType="afterEffect"><p:stCondLst><p:cond delay="0"/>'),
				'step1 wrapper delay=0 expected; got: ' + xml)
			assert(xml.includes('nodeType="afterEffect"><p:stCondLst><p:cond delay="90"/>'), 'step2 wrapper delay=90 expected; got: ' + xml)
			assert(xml.includes('nodeType="afterEffect"><p:stCondLst><p:cond delay="180"/>'), 'step3 wrapper delay=180 expected; got: ' + xml)
			// three sequential build steps, each carrying a fadeIn member (presetID=10)
			assert((xml.match(/fill="hold" nodeType="afterEffect"/g) || []).length === 3, 'expected 3 build-step wrappers; got: ' + xml)
			assert((xml.match(/presetID="10"/g) || []).length === 3, 'expected 3 fadeIn members; got: ' + xml)
		}
	},
	{
		name: 'animation: mixed appear + fadeIn on one slide',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('title', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn' } })
				s.addText('sub', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear' } })
			})
			assert(xml.includes('presetID="10"'), 'expected fadeIn block; got: ' + xml)
			assert(xml.includes('presetID="1"'), 'expected appear block; got: ' + xml)
			// exactly one fade animEffect (the appear has none)
			assert((xml.match(/<p:animEffect/g) || []).length === 1, 'expected exactly one animEffect; got: ' + xml)
		}
	},
	{
		name: 'animation: trigger withPrevious → nodeType="withEffect"',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', trigger: 'withPrevious' } }))
			assert(xml.includes('nodeType="withEffect"'), 'expected withEffect nodeType; got: ' + xml)
		}
	},
	{
		name: 'animation: trigger onClick → nodeType="clickEffect"',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear', trigger: 'onClick' } }))
			assert(xml.includes('nodeType="clickEffect"'), 'expected clickEffect nodeType; got: ' + xml)
		}
	},
	{
		name: 'animation: zoomIn → TWO <p:anim> blocks on ppt_w & ppt_h, 0 → #ppt_w/#ppt_h, presetID=23',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('z', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'zoomIn' } }))
			assert(xml.includes('<p:timing>'), 'expected timing; got: ' + xml)
			assert(xml.includes('presetID="23"'), 'zoomIn presetID must be 23; got: ' + xml)
			assert(/<p:cTn id="\d+" presetID="23" presetClass="entr"/.test(xml), 'zoomIn wrapping effect cTn must carry presetID=23 presetClass=entr; got: ' + xml)
			const animCount = (xml.match(/<p:anim calcmode="lin" valueType="num">/g) || []).length
			assert(animCount === 2, 'zoomIn must emit exactly TWO <p:anim> blocks (ppt_w + ppt_h); got ' + animCount + ': ' + xml)
			assert(xml.includes('<p:attrName>ppt_w</p:attrName>'), 'zoomIn must animate ppt_w; got: ' + xml)
			assert(xml.includes('<p:attrName>ppt_h</p:attrName>'), 'zoomIn must animate ppt_h; got: ' + xml)
			assert(xml.includes('<p:tav tm="0"><p:val><p:strVal val="0"/></p:val></p:tav>'), 'zoomIn must scale from 0 at tm=0; got: ' + xml)
			assert(xml.includes('<p:tav tm="100000"><p:val><p:strVal val="#ppt_w"/></p:val></p:tav>'), 'zoomIn ppt_w end #ppt_w; got: ' + xml)
			assert(xml.includes('<p:tav tm="100000"><p:val><p:strVal val="#ppt_h"/></p:val></p:tav>'), 'zoomIn ppt_h end #ppt_h; got: ' + xml)
			// visibility set still present alongside motion
			assert(xml.includes('<p:strVal val="visible"/>'), 'zoomIn must still emit visibility set; got: ' + xml)
		}
	},
	{
		name: 'animation: zoomIn custom duration → both <p:anim> <p:cTn dur="N">',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('z', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'zoomIn', duration: 720 } }))
			const durs = (xml.match(/<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="\d+" dur="(\d+)" fill="hold"\/>/g) || [])
			assert(durs.length === 2, 'zoomIn must emit two <p:anim> with dur; got: ' + xml)
			assert(durs.every(m => /dur="720"/.test(m)), 'both zoomIn <p:anim> must carry dur="720"; got: ' + xml)
		}
	},
	{
		name: 'animation: zoomIn keeps all <p:cTn id> unique (set + 2 anim distinct)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('z', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'zoomIn' } }))
			const ids = (xml.match(/<p:cTn id="(\d+)"/g) || []).map(m => m.match(/id="(\d+)"/)[1])
			const uniq = new Set(ids)
			assert(uniq.size === ids.length, `zoomIn <p:cTn id> values must be unique; got ${ids.join(',')}`)
		}
	},
	{
		name: 'animation: flyIn emits exactly ONE <p:anim> (zoomIn branch must not leak)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'left' } }))
			const animCount = (xml.match(/<p:anim calcmode="lin" valueType="num">/g) || []).length
			assert(animCount === 1, 'flyIn must emit exactly ONE <p:anim>; got ' + animCount + ': ' + xml)
			assert(!xml.includes('<p:attrName>ppt_w</p:attrName>'), 'flyIn must NOT animate ppt_w (no zoomIn leak); got: ' + xml)
			assert(!xml.includes('<p:attrName>ppt_h</p:attrName>'), 'flyIn must NOT animate ppt_h (no zoomIn leak); got: ' + xml)
		}
	},
	{
		name: 'animation: mixed fadeIn + flyIn + zoomIn → 3 effect blocks, presetIDs 10/2/23',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn' } })
				s.addShape('rect', { x: 1, y: 2, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'up' } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'zoomIn' } })
			})
			assert(xml.includes('presetID="10"'), 'expected fadeIn presetID=10; got: ' + xml)
			assert(xml.includes('presetID="2"'), 'expected flyIn presetID=2; got: ' + xml)
			assert(xml.includes('presetID="23"'), 'expected zoomIn presetID=23; got: ' + xml)
			// fadeIn = 1 animEffect; flyIn = 1 <p:anim>; zoomIn = 2 <p:anim> → 3 total <p:anim>
			assert((xml.match(/<p:animEffect/g) || []).length === 1, 'expected exactly 1 animEffect (fadeIn); got: ' + xml)
			assert((xml.match(/<p:anim calcmode="lin" valueType="num">/g) || []).length === 3, 'expected 3 <p:anim> (flyIn 1 + zoomIn 2); got: ' + xml)
			const ids = (xml.match(/<p:cTn id="(\d+)"/g) || []).map(m => m.match(/id="(\d+)"/)[1])
			assert(new Set(ids).size === ids.length, `mixed <p:cTn id> values must be unique; got ${ids.join(',')}`)
		}
	},
	{
		name: 'animation: flyIn left → <p:anim> on ppt_x, start "0-#ppt_w/2", end "#ppt_x"',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'left' } }))
			assert(xml.includes('presetID="2"'), 'flyIn presetID must be 2; got: ' + xml)
			assert(xml.includes('<p:anim calcmode="lin" valueType="num">'), 'expected <p:anim>; got: ' + xml)
			assert(xml.includes('<p:attrName>ppt_x</p:attrName>'), 'flyIn left must animate ppt_x; got: ' + xml)
			assert(xml.includes('<p:tav tm="0"><p:val><p:strVal val="0-#ppt_w/2"/></p:val></p:tav>'), 'flyIn left start formula; got: ' + xml)
			assert(xml.includes('<p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>'), 'flyIn left end #ppt_x; got: ' + xml)
			// visibility set still present alongside motion
			assert(xml.includes('<p:strVal val="visible"/>'), 'flyIn must still emit visibility set; got: ' + xml)
		}
	},
	{
		name: 'animation: flyIn right → start "1+#ppt_w/2" on ppt_x',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'right' } }))
			assert(xml.includes('<p:attrName>ppt_x</p:attrName>'), 'flyIn right must animate ppt_x; got: ' + xml)
			assert(xml.includes('<p:tav tm="0"><p:val><p:strVal val="1+#ppt_w/2"/></p:val></p:tav>'), 'flyIn right start formula; got: ' + xml)
		}
	},
	{
		name: 'animation: flyIn up → <p:anim> on ppt_y, start "0-#ppt_h/2", end "#ppt_y"',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'up' } }))
			assert(xml.includes('<p:attrName>ppt_y</p:attrName>'), 'flyIn up must animate ppt_y; got: ' + xml)
			assert(xml.includes('<p:tav tm="0"><p:val><p:strVal val="0-#ppt_h/2"/></p:val></p:tav>'), 'flyIn up start formula; got: ' + xml)
			assert(xml.includes('<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>'), 'flyIn up end #ppt_y; got: ' + xml)
		}
	},
	{
		name: 'animation: flyIn down → start "1+#ppt_h/2" on ppt_y',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'down' } }))
			assert(xml.includes('<p:attrName>ppt_y</p:attrName>'), 'flyIn down must animate ppt_y; got: ' + xml)
			assert(xml.includes('<p:tav tm="0"><p:val><p:strVal val="1+#ppt_h/2"/></p:val></p:tav>'), 'flyIn down start formula; got: ' + xml)
		}
	},
	{
		name: 'animation: flyIn default (no direction) → left formula (ppt_x, "0-#ppt_w/2")',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn' } }))
			assert(xml.includes('<p:attrName>ppt_x</p:attrName>'), 'flyIn default must animate ppt_x; got: ' + xml)
			assert(xml.includes('<p:tav tm="0"><p:val><p:strVal val="0-#ppt_w/2"/></p:val></p:tav>'), 'flyIn default = left start formula; got: ' + xml)
		}
	},
	{
		name: 'animation: flyIn custom duration → <p:anim> <p:cTn dur="N">',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', duration: 650 } }))
			assert(/<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="\d+" dur="650" fill="hold"\/>/.test(xml),
				'flyIn motion must carry dur="650"; got: ' + xml)
		}
	},
	{
		name: 'animation: appear/fadeIn emit ZERO <p:anim> (flyIn branch must not leak)',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear' } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'fadeIn' } })
			})
			assert(!xml.includes('<p:anim '), 'appear/fadeIn must NOT emit <p:anim>; got: ' + xml)
		}
	},
	{
		name: 'animation: flyIn keeps all <p:cTn id> unique (set id + anim id distinct)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addShape('rect', { x: 1, y: 1, w: 2, h: 1, fill: { color: 'FF0000' }, animation: { type: 'flyIn', direction: 'left' } }))
			const ids = (xml.match(/<p:cTn id="(\d+)"/g) || []).map(m => m.match(/id="(\d+)"/)[1])
			const uniq = new Set(ids)
			assert(uniq.size === ids.length, `flyIn <p:cTn id> values must be unique; got ${ids.join(',')}`)
		}
	},
	{
		name: 'animation: default-off → NO <p:timing> when nothing animated',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1 }))
			assert((xml.match(/<p:timing/g) || []).length === 0, 'unset animation must emit zero <p:timing>; got: ' + xml)
			assert(xml.includes('<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'),
				'default slide close must be byte-for-byte unchanged; got: ' + xml)
		}
	},
	{
		name: 'animation: multi-slide isolation (slide1 only)',
		fn: async () => {
			const { zip } = await build(p => {
				const s1 = p.addSlide()
				s1.addText('one', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn' } })
				const s2 = p.addSlide()
				s2.addText('two', { x: 1, y: 1, w: 4, h: 1 })
			})
			const xml1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xml2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(xml1.includes('<p:timing>'), 'slide1 must contain timing; got: ' + xml1)
			assert(!xml2.includes('<p:timing'), 'slide2 must NOT contain timing; got: ' + xml2)
		}
	},
	{
		name: 'animation: all <p:cTn id> values unique within the slide',
		fn: async () => {
			const xml = await slide1Xml(s => {
				s.addText('a', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'fadeIn' } })
				s.addText('b', { x: 1, y: 2, w: 4, h: 1, animation: { type: 'appear' } })
				s.addText('c', { x: 1, y: 3, w: 4, h: 1, animation: { type: 'fadeIn' } })
			})
			const ids = (xml.match(/<p:cTn id="(\d+)"/g) || []).map(m => m.match(/id="(\d+)"/)[1])
			assert(ids.length > 0, 'expected some <p:cTn id>; got: ' + xml)
			const uniq = new Set(ids)
			assert(uniq.size === ids.length, `<p:cTn id> values must be unique; got ${ids.join(',')}`)
		}
	},
	{
		name: 'animation: position after </p:clrMapOvr> and before </p:sld>',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear' } }))
			const clr = xml.indexOf('</p:clrMapOvr>')
			const timing = xml.indexOf('<p:timing>')
			const sldEnd = xml.indexOf('</p:sld>')
			assert(clr !== -1 && timing !== -1 && sldEnd !== -1, 'expected all markers; got: ' + xml)
			assert(clr < timing && timing < sldEnd, 'timing must sit between </p:clrMapOvr> and </p:sld>; got: ' + xml)
		}
	},
	{
		name: 'animation: spid matches object <p:cNvPr id> (idx + 2)',
		fn: async () => {
			// single object → idx 0 → cNvPr id="2" → spTgt spid="2"
			const xml = await slide1Xml(s => s.addText('hi', { x: 1, y: 1, w: 4, h: 1, animation: { type: 'appear' } }))
			assert(xml.includes('<p:cNvPr id="2"'), 'object cNvPr id must be 2; got: ' + xml)
			assert(xml.includes('<p:spTgt spid="2"/>'), 'spTgt spid must match (2); got: ' + xml)
		}
	},
	{
		name: 'animation: works on images (whitelist passthrough)',
		fn: async () => {
			const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
			const xml = await slide1Xml(s => s.addImage({ data: 'image/png;base64,' + b64, x: 1, y: 1, w: 1, h: 1, animation: { type: 'fadeIn' } }))
			assert(xml.includes('<p:timing>'), 'image animation must emit timing; got: ' + xml)
			assert(xml.includes('<p:animEffect transition="in" filter="fade">'), 'image fadeIn must emit animEffect; got: ' + xml)
		}
	}
]
