'use strict'

// SLICE-10 — parseCards() structure-driven HTML card-grid parser
// (docs/feature-parse-card-structure.md, RI-12). Tests run against the BUILT bundle
// (src/bld/utils.cjs.js) so they exercise shipped output; the end-to-end maps a parsed
// {type:'svg'} CardData into addCard on src/bld/pptxgen.cjs.js and validates the OOXML.

const JSZip = require('jszip')
const { parseCards } = require('../src/bld/utils.cjs.js')
const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { assert } = require('./helpers')
const { isInstalled, validateBuf } = require('./validator')

module.exports = [
	{
		name: 'parseCards pattern detection: cap-grid/cap-item + cap-title/cap-desc → 2 cards',
		fn: async () => {
			const a = parseCards('<div class="cap-grid"><div class="cap-item"><div class="cap-title">A</div><div class="cap-desc">x</div></div><div class="cap-item"><div class="cap-title">B</div></div></div>')
			assert(a.length === 2, 'expected 2 cards; got ' + a.length)
			assert(a[0].title === 'A', 'card0 title A; got ' + a[0].title)
			assert(a[0].description === 'x', 'card0 desc x; got ' + a[0].description)
			assert(a[1].title === 'B', 'card1 title B; got ' + a[1].title)
		},
	},
	{
		name: 'parseCards framework-agnostic naming: workflow-grid/wf-card/wf-title → same result',
		fn: async () => {
			const b = parseCards('<div class="workflow-grid"><div class="wf-card"><div class="wf-title">One</div></div><div class="wf-card"><div class="wf-title">Two</div></div></div>')
			assert(b.length === 2, 'expected 2 cards; got ' + b.length)
			assert(b[0].title === 'One', 'card0 title One; got ' + b[0].title)
			assert(b[1].title === 'Two', 'card1 title Two; got ' + b[1].title)
		},
	},
	{
		name: 'parseCards icon typing: <i class="fas fa-*"> → fontIcon; <b> heading fallback',
		fn: async () => {
			const fa = parseCards('<div class="grid"><div class="card"><i class="fas fa-users"></i><div class="title">Team</div></div><div class="card"><i class="fas fa-code"></i><b>Build</b></div></div>')
			assert(fa.length === 2, 'expected 2 cards; got ' + fa.length)
			assert(fa[0].icon && (fa[0].icon.type === 'fontIcon' || fa[0].icon.type === 'svg'), 'card0 icon fontIcon/svg; got ' + JSON.stringify(fa[0].icon))
			assert(fa[0].icon.type === 'fontIcon' && fa[0].icon.fontFace === 'Font Awesome 6 Free', 'fontIcon fontFace; got ' + JSON.stringify(fa[0].icon))
			assert(fa[0].title === 'Team', 'card0 title Team; got ' + fa[0].title)
			assert(fa[1].title === 'Build', 'card1 title via <b> Build; got ' + fa[1].title)
		},
	},
	{
		name: 'parseCards structure-driven (no semantic classes): display:grid, svg icon, 1st=title 2nd=desc',
		fn: async () => {
			const inl = parseCards('<div style="display:grid"><div style="background:#1a1a24"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>Knowledge Graph</div><div>Memory</div></div><div style="background:#1a1a24"><div>Agents</div></div></div>')
			assert(inl.length === 2, 'expected 2 cards; got ' + inl.length)
			assert(inl[0].title === 'Knowledge Graph', 'card0 title; got ' + inl[0].title)
			assert(inl[0].description === 'Memory', 'card0 desc; got ' + inl[0].description)
			assert(inl[0].icon && inl[0].icon.type === 'svg', 'card0 icon svg; got ' + JSON.stringify(inl[0].icon))
			assert(inl[0].icon.parts.length === 1, 'svg icon → 1 part (circle); got ' + inl[0].icon.parts.length)
			assert(inl[0].colors.cardFill === '1A1A24', 'card0 cardFill from inline bg; got ' + inl[0].colors.cardFill)
			// second card has only a title, no icon
			assert(inl[1].title === 'Agents', 'card1 title; got ' + inl[1].title)
		},
	},
	{
		name: 'parseCards badge + inline colour extraction',
		fn: async () => {
			const bdg = parseCards('<div class="grid"><div class="card" style="background:#1a1a24;border:1px solid #2A2438"><span class="badge" style="background:#10B981">NEW</span><div class="title">X</div></div><div class="card"><div class="title">Y</div></div></div>')
			assert(bdg.length === 2, 'expected 2 cards; got ' + bdg.length)
			assert(bdg[0].badge && bdg[0].badge.text === 'NEW', 'badge text NEW; got ' + JSON.stringify(bdg[0].badge))
			assert(bdg[0].badge.color === '10B981', 'badge fill 10B981; got ' + bdg[0].badge.color)
			assert(bdg[0].colors.borderColor === '2A2438', 'borderColor 2A2438; got ' + bdg[0].colors.borderColor)
			assert(bdg[0].colors.cardFill === '1A1A24', 'cardFill 1A1A24; got ' + bdg[0].colors.cardFill)
			// the badge text must NOT leak into the title
			assert(bdg[0].title === 'X', 'card0 title X (badge excluded); got ' + bdg[0].title)
		},
	},
	{
		name: 'parseCards guards: empty / no-match / single-card → [] (clamp, no throw)',
		fn: async () => {
			assert(parseCards('').length === 0, 'empty string → []')
			assert(parseCards(null).length === 0, 'null → []')
			assert(parseCards('<div><p>hello</p><p>world</p></div>').length === 0, 'no grid/card → []')
			assert(parseCards('<div><div class="card"><div class="title">Solo</div></div></div>').length === 0, 'single card under non-grid → []')
			// excludeWithin: cards inside a flow/anim region are skipped
			const ex = parseCards('<div class="product-anim"><div class="card"><div class="title">A</div></div><div class="card"><div class="title">B</div></div></div>')
			assert(ex.length === 0, 'cards inside excludeWithin region → []; got ' + ex.length)
		},
	},
	{
		name: 'parseCards multi-path svg icon: per-path fills survive via parseSvg',
		fn: async () => {
			const m = parseCards('<div class="grid"><div class="card"><svg viewBox="0 0 24 24"><path d="M0 0L8 0" fill="#FF0000"/><path d="M0 8L8 8" fill="#00FF00"/></svg><div class="title">Logo</div></div><div class="card"><div class="title">Other</div></div></div>')
			assert(m.length === 2, 'expected 2 cards; got ' + m.length)
			assert(m[0].icon.type === 'svg', 'card0 icon svg; got ' + JSON.stringify(m[0].icon))
			assert(m[0].icon.parts.length === 2, 'expected 2 parts (two fills); got ' + m[0].icon.parts.length)
			assert(m[0].icon.parts[0].fill === 'FF0000' && m[0].icon.parts[1].fill === '00FF00', 'per-path fills intact; got ' + JSON.stringify(m[0].icon.parts.map(p => p.fill)))
		},
	},
	{
		name: 'parseCards END-TO-END: parsed {type:svg} CardData → addCard → validateBuf 0 errors, custGeom == parts.length',
		fn: async () => {
			if (!isInstalled()) { console.log('       (skipped: OOXMLValidatorCLI not installed)'); return }
			const html = '<div class="cards-grid">' +
				'<div class="feature-card" style="background:#1A1A24;border:1px solid #2A2438">' +
					'<svg viewBox="0 0 24 24">' +
						'<circle cx="12" cy="12" r="9" fill="#FF4B14"/>' +
						'<rect x="6" y="6" width="12" height="6" rx="2" fill="#10B981"/>' +
						'<path d="M4 12 A8 8 0 0 1 20 12" fill="none" stroke="#7C3AED" stroke-width="2"/>' +
					'</svg>' +
					'<div class="card-title">Pipeline</div>' +
					'<div class="card-desc">Streaming ingest</div>' +
				'</div>' +
				'<div class="feature-card"><div class="card-title">Storage</div></div>' +
				'</div>'
			const cards = parseCards(html, { defaultFill: '333333' })
			assert(cards.length === 2, 'expected 2 cards; got ' + cards.length)
			const c0 = cards[0]
			assert(c0.icon && c0.icon.type === 'svg', 'card0 svg icon; got ' + JSON.stringify(c0.icon))
			assert(c0.icon.parts.length >= 2, 'expected ≥2 svg parts; got ' + c0.icon.parts.length)
			assert(c0.title === 'Pipeline' && c0.description === 'Streaming ingest', 'card0 title/desc; got ' + c0.title + ' / ' + c0.description)
			assert(c0.colors.cardFill === '1A1A24' && c0.colors.borderColor === '2A2438', 'card0 colours; got ' + JSON.stringify(c0.colors))
			// none of the normalised svg paths may carry an unsupported command
			c0.icon.parts.forEach((p, i) => assert(!/[AaHhVvSsTt]/.test(p.d), 'part ' + i + ' has unsupported cmd: ' + p.d))

			const pres = new PptxGenJS()
			const slide = pres.addSlide()
			slide.addCard({
				x: 0.5, y: 0.5, w: 3, h: 2,
				title: c0.title,
				description: c0.description,
				icon: { parts: c0.icon.parts },
				fill: c0.colors.cardFill ? { color: c0.colors.cardFill } : undefined,
				border: c0.colors.borderColor ? { color: c0.colors.borderColor, width: 1 } : undefined,
			})
			const buf = await pres.stream()
			const errors = await validateBuf(Buffer.isBuffer(buf) ? buf : Buffer.from(buf))
			assert(errors.length === 0, 'expected 0 validation errors; got ' + JSON.stringify(errors.slice(0, 5)))
			const zip = await JSZip.loadAsync(buf)
			const xml = await zip.file('ppt/slides/slide1.xml').async('string')
			const custGeom = (xml.match(/<a:custGeom>/g) || []).length
			assert(custGeom === c0.icon.parts.length, 'custGeom count (' + custGeom + ') must == parts.length (' + c0.icon.parts.length + ')')
			assert(xml.indexOf('<a:cubicBezTo>') !== -1, 'expected converted cubic geometry (circle/arc → cubics)')
		},
	},
]
