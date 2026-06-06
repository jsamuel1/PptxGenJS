'use strict'

// Slice 2 — Slide transitions (PROMPT.md §Feature 1).
// Asserts the emitted `<p:transition>` OOXML in ppt/slides/slideN.xml,
// its placement (after </p:clrMapOvr>, before </p:sld>), and default-off.

const { build, readEntry, assert } = require('./helpers')

// Build a single-slide deck with the given transition and return slide1.xml.
async function slideXml(transition) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		s.transition = transition
		s.addText('hi', { x: 1, y: 1, w: 4, h: 1 })
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

module.exports = [
	{
		name: 'transition: fade default duration → spd="med" <p:fade/>',
		fn: async () => {
			const xml = await slideXml({ type: 'fade' })
			assert(xml.includes('<p:transition spd="med"><p:fade/></p:transition>'),
				'expected fade spd="med"; got: ' + xml)
		}
	},
	{
		name: 'transition: fade custom duration 250 → spd="fast"',
		fn: async () => {
			const xml = await slideXml({ type: 'fade', duration: 250 })
			assert(xml.includes('<p:transition spd="fast"><p:fade/></p:transition>'),
				'expected fade spd="fast"; got: ' + xml)
		}
	},
	{
		name: 'transition: duration 1000 → spd="slow"',
		fn: async () => {
			const xml = await slideXml({ type: 'fade', duration: 1000 })
			assert(xml.includes('<p:transition spd="slow"><p:fade/></p:transition>'),
				'expected fade spd="slow"; got: ' + xml)
		}
	},
	{
		name: 'transition: push each direction → dir="l|r|u|d"',
		fn: async () => {
			const cases = [['left', 'l'], ['right', 'r'], ['up', 'u'], ['down', 'd']]
			for (const [direction, d] of cases) {
				const xml = await slideXml({ type: 'push', direction })
				assert(xml.includes(`<p:transition spd="med"><p:push dir="${d}"/></p:transition>`),
					`expected push dir="${d}" for ${direction}; got: ` + xml)
			}
		}
	},
	{
		name: 'transition: push default direction → dir="l"',
		fn: async () => {
			const xml = await slideXml({ type: 'push' })
			assert(xml.includes('<p:push dir="l"/>'), 'expected default push dir="l"; got: ' + xml)
		}
	},
	{
		name: 'transition: wipe up custom duration 750 → spd="med" dir="u"',
		fn: async () => {
			const xml = await slideXml({ type: 'wipe', direction: 'up', duration: 750 })
			assert(xml.includes('<p:transition spd="med"><p:wipe dir="u"/></p:transition>'),
				'expected wipe spd="med" dir="u"; got: ' + xml)
		}
	},
	{
		name: 'transition: cover directional → <p:cover dir="r"/>',
		fn: async () => {
			const xml = await slideXml({ type: 'cover', direction: 'right' })
			assert(xml.includes('<p:cover dir="r"/>'), 'expected cover dir="r"; got: ' + xml)
		}
	},
	{
		name: 'transition: split (non-directional) → <p:split/>',
		fn: async () => {
			const xml = await slideXml({ type: 'split' })
			assert(xml.includes('<p:transition spd="med"><p:split/></p:transition>'),
				'expected split; got: ' + xml)
		}
	},
	{
		name: 'transition: cut (non-directional) → <p:cut/>',
		fn: async () => {
			const xml = await slideXml({ type: 'cut' })
			assert(xml.includes('<p:transition spd="med"><p:cut/></p:transition>'),
				'expected cut; got: ' + xml)
		}
	},
	{
		name: 'transition: type "none" → NO <p:transition> element',
		fn: async () => {
			const xml = await slideXml({ type: 'none' })
			assert(!xml.includes('<p:transition'), 'type none must emit no transition; got: ' + xml)
		}
	},
	{
		name: 'transition: null → NO <p:transition> element',
		fn: async () => {
			const xml = await slideXml(null)
			assert(!xml.includes('<p:transition'), 'null must emit no transition; got: ' + xml)
		}
	},
	{
		name: 'transition: default-off regression guard (no transition set)',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('hi', { x: 1, y: 1, w: 4, h: 1 })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			assert((xml.match(/<p:transition/g) || []).length === 0,
				'unset transition must emit zero <p:transition>; got: ' + xml)
			// slide must still end with the canonical clrMapOvr/sld close
			assert(xml.includes('<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'),
				'default slide close must be byte-for-byte unchanged; got: ' + xml)
		}
	},
	{
		name: 'transition: element position after </p:clrMapOvr> and before </p:sld>',
		fn: async () => {
			const xml = await slideXml({ type: 'fade' })
			assert(xml.includes('</p:clrMapOvr><p:transition spd="med"><p:fade/></p:transition></p:sld>'),
				'transition must sit between </p:clrMapOvr> and </p:sld>; got: ' + xml)
		}
	},
	{
		name: 'transition: multi-slide isolation (set on slide 1 only)',
		fn: async () => {
			const { zip } = await build(p => {
				const s1 = p.addSlide()
				s1.transition = { type: 'fade' }
				s1.addText('one', { x: 1, y: 1, w: 4, h: 1 })
				const s2 = p.addSlide()
				s2.addText('two', { x: 1, y: 1, w: 4, h: 1 })
			})
			const xml1 = await readEntry(zip, 'ppt/slides/slide1.xml')
			const xml2 = await readEntry(zip, 'ppt/slides/slide2.xml')
			assert(xml1.includes('<p:transition'), 'slide1 must contain transition; got: ' + xml1)
			assert(!xml2.includes('<p:transition'), 'slide2 must NOT contain transition; got: ' + xml2)
		}
	}
]
