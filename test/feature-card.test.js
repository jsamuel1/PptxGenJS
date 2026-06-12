'use strict'

// Feature: addCard() — structured card rendering (docs/features/feature-card-helper.md).
// A card is emitted as a single <p:grpSp> group containing a rounded-rect background and,
// as applicable, an icon container + icon (SVG custGeom or emoji text), a title, a
// description, and a top-right badge. Card-level `animation` attaches to the group object.

const { build, readEntry, assert } = require('./helpers')
const { parseSvg } = require('../src/bld/utils.cjs.js')

async function slide1Xml(addObjs) {
	const { zip } = await build(p => {
		const s = p.addSlide()
		addObjs(s)
	})
	return readEntry(zip, 'ppt/slides/slide1.xml')
}

function groupInner(xml) {
	const start = xml.indexOf('<p:grpSp>')
	const end = xml.indexOf('</p:grpSp>')
	assert(start !== -1 && end !== -1 && end > start, 'expected a complete <p:grpSp>…</p:grpSp>; got: ' + xml)
	return xml.substring(start, end)
}

// The accent bar is the only shape that is a `prst="rect"` WITH a fill (solid or gradient).
// Card text frames (title/desc/emoji) are also `prst="rect"` but always carry `<a:noFill/>`,
// and the background/icon tiles are `prst="roundRect"`. This matches a filled accent rect only.
function accentRectFills(inner) {
	const re = /prst="rect"><a:avLst><\/a:avLst><\/a:prstGeom>(<a:solidFill>|<a:gradFill)/g
	return (inner.match(re) || [])
}

module.exports = [
	{
		name: 'addCard: minimal → group with roundRect bg + title text',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Hello', fill: '1a1a24' }))
			const inner = groupInner(xml)
			assert(inner.indexOf('prst="roundRect"') !== -1, 'expected roundRect background; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="1A1A24"/>') !== -1, 'expected card fill 1A1A24; got: ' + inner)
			assert(inner.indexOf('<a:t>Hello</a:t>') !== -1, 'expected title text "Hello"; got: ' + inner)
		},
	},
	{
		name: 'addCard: no icon/desc/badge → exactly one roundRect (the background)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Solo' }))
			const inner = groupInner(xml)
			assert((inner.match(/prst="roundRect"/g) || []).length === 1, 'expected exactly 1 roundRect (bg only); got: ' + inner)
		},
	},
	{
		name: 'addCard: with description → two text frames (title + desc) inside the group',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3.5, h: 2.5, title: 'Title', description: 'Some body text' }))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:t>Title</a:t>') !== -1, 'expected title; got: ' + inner)
			assert(inner.indexOf('<a:t>Some body text</a:t>') !== -1, 'expected description; got: ' + inner)
		},
	},
	{
		name: 'addCard: SVG icon → <a:custGeom> icon glyph + icon container roundRect',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3.5, h: 2.5,
				title: 'Scheduled Agents',
				description: 'Autonomous monitors that run on a schedule',
				icon: { svgPath: { d: 'M 0 0 L 24 0 L 12 24 Z', viewBox: { w: 24, h: 24 } } },
				fill: '1a1a24',
			}))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:custGeom>') !== -1, 'expected SVG icon as custGeom; got: ' + inner)
			// bg + icon container = 2 roundRects
			assert((inner.match(/prst="roundRect"/g) || []).length === 2, 'expected 2 roundRects (bg + icon container); got: ' + inner)
		},
	},
	{
		name: 'addCard: emoji icon → text glyph rendered inside the group',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Memory', icon: '🔮' }))
			const inner = groupInner(xml)
			assert(inner.indexOf('🔮') !== -1, 'expected emoji icon glyph; got: ' + inner)
		},
	},
	{
		name: 'addCard: badge → badge roundRect + centred badge text',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3.5, h: 2.5, title: 'Card', badge: { text: 'ACTIVE', fill: '10B981' },
			}))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:t>ACTIVE</a:t>') !== -1, 'expected badge text ACTIVE; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="10B981"/>') !== -1, 'expected badge fill 10B981; got: ' + inner)
		},
	},
	{
		name: 'addCard: shadow on background → <a:outerShdw> emitted inside the group',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3.5, h: 2.5, title: 'Card',
				shadow: { blur: 8, offset: 2, color: '000000', opacity: 0.3 },
			}))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:outerShdw') !== -1, 'expected outer shadow; got: ' + inner)
		},
	},
	{
		name: 'addCard: full card with animation → group animates via <p:timing>',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3.5, h: 2.5,
				title: 'Scheduled Agents',
				description: 'Autonomous monitors',
				icon: { svgPath: { d: 'M21 11V6 Z', viewBox: { w: 24, h: 24 } } },
				badge: { text: 'ACTIVE', fill: '10B981' },
				fill: '1a1a24',
				shadow: { blur: 8, offset: 2, color: '000000', opacity: 0.3 },
				cornerRadius: 0.12,
				animation: { type: 'fadeIn', group: 2, stagger: 100 },
			}))
			assert(xml.indexOf('<p:grpSp>') !== -1, 'expected card group; got: ' + xml)
			assert(xml.indexOf('<p:timing>') !== -1, 'expected timing for card animation; got: ' + xml)
			// spid targets the group object (idx+2 == 2 for the only top-level object)
			assert(xml.indexOf('<p:spTgt spid="2"/>') !== -1, 'expected animation targeting the group (spid=2); got: ' + xml)
		},
	},
	{
		name: 'addCard: font-icon {char,fontFace} + bare (iconFill:none) → typeface run, accent color, no icon tile',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3, h: 2, title: 'X',
				icon: { char: '\uf1c4', fontFace: 'Font Awesome 6 Free Solid', color: 'A78BFA' },
				iconFill: 'none',
			}))
			const inner = groupInner(xml)
			assert(inner.indexOf('typeface="Font Awesome 6 Free Solid"') !== -1, 'expected font-icon typeface; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="A78BFA"/>') !== -1, 'expected icon accent color A78BFA; got: ' + inner)
			// bare icon: only the background roundRect remains (no icon-container tile)
			assert((inner.match(/prst="roundRect"/g) || []).length === 1, 'expected 1 roundRect (bg only, no icon tile); got: ' + inner)
		},
	},
	{
		name: 'addCard: bare-icon (iconFill:false) svg + iconColor → custGeom in accent color, no icon tile',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3, h: 2, title: 'Y',
				icon: { svgPath: { d: 'M3 12h18', viewBox: { w: 24, h: 24 } } },
				iconFill: false, iconColor: '10B981',
			}))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:custGeom>') !== -1, 'expected svg custGeom; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="10B981"/>') !== -1, 'expected iconColor 10B981 on glyph; got: ' + inner)
			assert((inner.match(/prst="roundRect"/g) || []).length === 1, 'expected 1 roundRect (bg only, no icon tile); got: ' + inner)
		},
	},
	{
		name: 'addCard: iconColor overrides default glyph color on a tiled emoji icon',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3, h: 2, title: 'Z', icon: '★', iconColor: 'FF8800',
			}))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:srgbClr val="FF8800"/>') !== -1, 'expected glyph accent FF8800; got: ' + inner)
			// tile still drawn (iconFill not suppressed): bg + icon container = 2 roundRects
			assert((inner.match(/prst="roundRect"/g) || []).length === 2, 'expected 2 roundRects (bg + icon tile); got: ' + inner)
		},
	},
	{
		name: 'addCard: DEFAULT-OFF — v1 emoji card (no iconColor) keeps icon tile + default glyph color E4E4ED',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Z', icon: '🚀', iconFill: '7C3AED' }))
			const inner = groupInner(xml)
			// bg + icon container tile = 2 roundRects (unchanged from v1)
			assert((inner.match(/prst="roundRect"/g) || []).length === 2, 'expected 2 roundRects (bg + icon tile); got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'expected icon tile fill 7C3AED; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="E4E4ED"/>') !== -1, 'expected default glyph color E4E4ED; got: ' + inner)
		},
	},
	{
		name: 'addCard: DEFAULT-OFF — v1 svg card (no iconColor) keeps icon tile + glyph color E4E4ED',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3, h: 2, title: 'Z',
				icon: { svgPath: { d: 'M 0 0 L 24 0 L 12 24 Z', viewBox: { w: 24, h: 24 } } },
			}))
			const inner = groupInner(xml)
			assert((inner.match(/prst="roundRect"/g) || []).length === 2, 'expected 2 roundRects (bg + icon tile); got: ' + inner)
			assert(inner.indexOf('<a:custGeom>') !== -1, 'expected svg custGeom; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="E4E4ED"/>') !== -1, 'expected default glyph color E4E4ED; got: ' + inner)
		},
	},
	{
		name: 'addCard: GUARD — font-icon object missing fontFace does not throw and renders no glyph run',
		fn: async () => {
			// { char } without fontFace must NOT match the font-icon arm (and must not crash)
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'G', icon: { char: '\uf1c4' } }))
			const inner = groupInner(xml)
			// tile still drawn (icon present), but no typeface run for the icon glyph
			assert(inner.indexOf('typeface="undefined"') === -1, 'must not emit a font-icon run with undefined typeface; got: ' + inner)
			assert(inner.indexOf('<a:t>G</a:t>') !== -1, 'title still rendered; got: ' + inner)
		},
	},
	{
		name: 'addCard: accentBar (solid) → extra rect with solidFill in the bar color',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'X', accentBar: { color: '38BDF8', width: 0.05 } }))
			const inner = groupInner(xml)
			const fills = accentRectFills(inner)
			assert(fills.length === 1 && fills[0].endsWith('<a:solidFill>'), 'expected exactly one solid-filled accent rect; got: ' + fills)
			assert(inner.indexOf('<a:srgbClr val="38BDF8"/>') !== -1, 'expected accent bar solid fill 38BDF8; got: ' + inner)
		},
	},
	{
		name: 'addCard: accentBar (gradient) → accent rect emits <a:gradFill> with both stops',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3, h: 2, title: 'Y',
				accentBar: { color: { type: 'gradient', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }], direction: 90 } },
			}))
			const inner = groupInner(xml)
			const fills = accentRectFills(inner)
			assert(fills.length === 1 && fills[0].endsWith('<a:gradFill'), 'expected exactly one gradient-filled accent rect; got: ' + fills)
			assert(inner.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'expected gradient stop 7C3AED; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="38BDF8"/>') !== -1, 'expected gradient stop 38BDF8; got: ' + inner)
		},
	},
	{
		name: 'addCard: accentBar ({}) guard → default-colour bar (7C3AED), no throw',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'G', accentBar: {} }))
			const inner = groupInner(xml)
			const fills = accentRectFills(inner)
			assert(fills.length === 1 && fills[0].endsWith('<a:solidFill>'), 'expected one solid accent rect; got: ' + fills)
			assert(inner.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'expected default accent color 7C3AED; got: ' + inner)
		},
	},
	{
		name: 'addCard: DEFAULT-OFF — v1 card (no accentBar) emits NO filled accent rect',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Z', description: 'body', icon: '🚀' }))
			const inner = groupInner(xml)
			assert(accentRectFills(inner).length === 0, 'v1 card must emit no filled accent rect; got: ' + inner)
		},
	},
	{
		name: 'addCard: default-off — a deck with no card emits no <p:grpSp> from addCard',
		fn: async () => {
			const xml = await slide1Xml(s => s.addText('plain', { x: 1, y: 1, w: 4, h: 1 }))
			assert(xml.indexOf('<p:grpSp>') === -1, 'no group expected when addCard not used; got: ' + xml)
		},
	},
	{
		name: 'addCard: multi-colour SVG {parts} (real parseSvg) → one custGeom per part, each in its own fill',
		fn: async () => {
			// Three distinct-colour fill paths → parseSvg yields 3 parts → 3 custGeom children.
			const logoSvg = '<svg viewBox="0 0 24 24">' +
				'<path d="M2 2 L10 2 L10 10 Z" fill="#FF0000"/>' +
				'<path d="M12 2 L20 2 L20 10 Z" fill="#00FF00"/>' +
				'<path d="M2 12 L10 12 L10 20 Z" fill="#0000FF"/>' +
				'</svg>'
			const parts = parseSvg(logoSvg)
			assert(parts.length === 3, 'precondition: parseSvg yields 3 parts; got: ' + parts.length)
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3.5, h: 2.5, title: 'Logo', icon: { parts } }))
			const inner = groupInner(xml)
			assert((inner.match(/<a:custGeom>/g) || []).length === 3, 'expected exactly 3 custGeom children (one per part); got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="FF0000"/>') !== -1, 'expected part fill FF0000; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="00FF00"/>') !== -1, 'expected part fill 00FF00; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="0000FF"/>') !== -1, 'expected part fill 0000FF; got: ' + inner)
		},
	},
	{
		name: 'addCard: {parts} with a gradient part → that custGeom carries <a:gradFill>',
		fn: async () => {
			const parts = [{
				d: 'M 0 0 L 24 0 L 24 24 L 0 24 Z', viewBox: { w: 24, h: 24 }, mode: 'fill',
				fill: { type: 'gradient', stops: [{ position: 0, color: '7C3AED' }, { position: 100, color: '38BDF8' }], direction: 90 },
			}]
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'G', icon: { parts } }))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:custGeom>') !== -1, 'expected custGeom for the gradient part; got: ' + inner)
			assert(inner.indexOf('<a:gradFill') !== -1, 'expected <a:gradFill> on the gradient part; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'expected gradient stop 7C3AED; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="38BDF8"/>') !== -1, 'expected gradient stop 38BDF8; got: ' + inner)
		},
	},
	{
		name: 'addCard: {parts} with a stroke part → custGeom with no solidFill + <a:ln> in the stroke colour',
		fn: async () => {
			const parts = [{
				d: 'M 2 12 L 22 12', viewBox: { w: 24, h: 24 }, mode: 'stroke', stroke: 'FF8800', strokeWidth: 2,
			}]
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'S', icon: { parts } }))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:custGeom>') !== -1, 'expected custGeom for the stroke part; got: ' + inner)
			// the stroke part's geometry shape carries a noFill + a line in the stroke colour
			const geomStart = inner.indexOf('<a:custGeom>')
			const spStart = inner.lastIndexOf('<p:sp>', geomStart)
			const spEnd = inner.indexOf('</p:sp>', geomStart)
			const spXml = inner.substring(spStart, spEnd)
			// the geometry carries NO shape fill (no solidFill before the <a:ln>); colour lives in the line only
			const beforeLn = spXml.substring(0, spXml.indexOf('<a:ln'))
			assert(beforeLn.indexOf('<a:solidFill>') === -1, 'stroke part must not carry a shape solidFill; got: ' + spXml)
			assert(spXml.indexOf('<a:ln') !== -1, 'expected <a:ln> on the stroke part; got: ' + spXml)
			assert(spXml.indexOf('<a:srgbClr val="FF8800"/>') !== -1, 'expected stroke colour FF8800; got: ' + spXml)
		},
	},
	{
		name: 'addCard: {parts: []} guard → no custGeom from the icon slot, no throw',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Empty', icon: { parts: [] } }))
			const inner = groupInner(xml)
			assert((inner.match(/<a:custGeom>/g) || []).length === 0, 'expected no custGeom for empty parts; got: ' + inner)
			assert(inner.indexOf('<a:t>Empty</a:t>') !== -1, 'title still rendered; got: ' + inner)
		},
	},
	{
		name: 'addCard: DEFAULT-OFF — v1 {svgPath} card still emits exactly ONE custGeom (parts arm did not perturb it)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({
				x: 1, y: 1, w: 3, h: 2, title: 'V1',
				icon: { svgPath: { d: 'M 0 0 L 24 0 L 12 24 Z', viewBox: { w: 24, h: 24 } } },
			}))
			const inner = groupInner(xml)
			assert((inner.match(/<a:custGeom>/g) || []).length === 1, 'expected exactly 1 custGeom (single svgPath); got: ' + inner)
		},
	},
	{
		name: 'addCard: count badge (top-right) → 1 ellipse bubble + value text, default fill 7C3AED',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'Inbox', badge: { type: 'count', value: 5 } }))
			const inner = groupInner(xml)
			assert((inner.match(/prst="ellipse"/g) || []).length === 1, 'expected exactly 1 ellipse bubble; got: ' + inner)
			assert(inner.indexOf('<a:t>5</a:t>') !== -1, 'expected count value text "5"; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="7C3AED"/>') !== -1, 'expected default count bubble fill 7C3AED; got: ' + inner)
		},
	},
	{
		name: 'addCard: count badge (inline-right) → bubble y differs from top-right (vertically centred)',
		fn: async () => {
			const top = groupInner(await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'A', badge: { type: 'count', value: 3 } })))
			const inline = groupInner(await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'A', badge: { type: 'count', value: 3, position: 'inline-right' } })))
			// The bubble is the only ellipse; compare its <a:off y="…"> within the ellipse <p:sp>.
			const bubbleY = inner => {
				const e = inner.indexOf('prst="ellipse"')
				const sp = inner.lastIndexOf('<a:off ', e)
				return inner.substring(sp, inner.indexOf('/>', sp))
			}
			const topY = bubbleY(top)
			const inlineY = bubbleY(inline)
			assert(topY !== inlineY, 'inline-right bubble y must differ from top-right; both were: ' + topY)
			// top-right sits at padding (0.2in = 182880 EMU); inline-right is centred lower.
			assert(topY.indexOf('y="182880"') !== -1, 'expected top-right bubble at padding y=182880; got: ' + topY)
			assert(inlineY.indexOf('y="786384"') !== -1, 'expected inline-right bubble centred at y=786384; got: ' + inlineY)
		},
	},
	{
		name: 'addCard: count badge custom fill/color → exact srgbClr values on bubble + text',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'N', badge: { type: 'count', value: 99, fill: 'EF4444', color: '111827' } }))
			const inner = groupInner(xml)
			assert(inner.indexOf('<a:srgbClr val="EF4444"/>') !== -1, 'expected custom bubble fill EF4444; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="111827"/>') !== -1, 'expected custom value text color 111827; got: ' + inner)
			assert(inner.indexOf('<a:t>99</a:t>') !== -1, 'expected value text "99"; got: ' + inner)
		},
	},
	{
		name: 'addCard: DEFAULT-OFF — text-pill badge { text } still renders roundRect pill (NOT ellipse)',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3.5, h: 2.5, title: 'Card', badge: { text: 'ACTIVE', fill: '10B981' } }))
			const inner = groupInner(xml)
			assert((inner.match(/prst="ellipse"/g) || []).length === 0, 'text-pill badge must emit NO ellipse; got: ' + inner)
			// bg + pill = 2 roundRects, unchanged from v1
			assert((inner.match(/prst="roundRect"/g) || []).length === 2, 'expected 2 roundRects (bg + pill); got: ' + inner)
			assert(inner.indexOf('<a:t>ACTIVE</a:t>') !== -1, 'expected pill text ACTIVE; got: ' + inner)
			assert(inner.indexOf('<a:srgbClr val="10B981"/>') !== -1, 'expected pill fill 10B981; got: ' + inner)
		},
	},
	{
		name: 'addCard: count badge GUARD — non-finite value renders "0", does not throw',
		fn: async () => {
			const xml = await slide1Xml(s => s.addCard({ x: 1, y: 1, w: 3, h: 2, title: 'G', badge: { type: 'count', value: NaN } }))
			const inner = groupInner(xml)
			assert((inner.match(/prst="ellipse"/g) || []).length === 1, 'expected bubble still drawn; got: ' + inner)
			assert(inner.indexOf('<a:t>0</a:t>') !== -1, 'expected non-finite value to render "0"; got: ' + inner)
		},
	},
]
