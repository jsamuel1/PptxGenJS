'use strict'

// SLICE-10 — parseCards() structure-driven HTML card-grid parser
// (docs/features/feature-parse-card-structure.md, RI-12). Tests run against the BUILT bundle
// (src/bld/utils.cjs.js) so they exercise shipped output; the end-to-end maps a parsed
// {type:'svg'} CardData into addCard on src/bld/pptxgen.cjs.js and validates the OOXML.

const fs = require('fs')
const path = require('path')
const JSZip = require('jszip')
const { parseCards, parseBadges, parseQuote } = require('../src/bld/utils.cjs.js')
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
			assert(fa[0].icon.type === 'fontIcon' && fa[0].icon.fontFace === 'Font Awesome 6 Free Solid', 'fontIcon fontFace; got ' + JSON.stringify(fa[0].icon))
			assert(fa[0].icon.glyphName === 'users' && fa[0].icon.className === 'fas fa-users' && fa[0].icon.fontFamily === 'fa', 'fontIcon glyph identity; got ' + JSON.stringify(fa[0].icon))
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
	{
		name: 'parseCards CSS cascade: <style> class rule supplies fill + border (no inline colour)',
		fn: async () => {
			const c = parseCards('<style>.card{background:#1a1a24;border:1px solid #2A2438}</style><div class="grid"><div class="card"><div class="title">A</div></div><div class="card"><div class="title">B</div></div></div>')
			assert(c.length === 2, 'expected 2 cards; got ' + c.length)
			assert(c[0].colors.cardFill === '1A1A24', 'cardFill from class rule; got ' + c[0].colors.cardFill)
			assert(c[0].colors.borderColor === '2A2438', 'borderColor from class rule; got ' + c[0].colors.borderColor)
		},
	},
	{
		name: 'parseCards CSS cascade: var() against :root resolved in inline style',
		fn: async () => {
			const c = parseCards('<style>:root{--bg:#10121A;--ln:#2A2438}</style><div class="grid"><div class="card" style="background:var(--bg);border:1px solid var(--ln)"><div class="title">A</div></div><div class="card"><div class="title">B</div></div></div>')
			assert(c.length === 2, 'expected 2 cards; got ' + c.length)
			assert(c[0].colors.cardFill === '10121A', 'cardFill from var(); got ' + c[0].colors.cardFill)
			assert(c[0].colors.borderColor === '2A2438', 'borderColor from var(); got ' + c[0].colors.borderColor)
		},
	},
	{
		name: 'parseCards CSS cascade: var() inside a class rule (badge fill)',
		fn: async () => {
			const c = parseCards('<style>:root{--accent:#7C3AED}.badge{background:var(--accent)}</style><div class="grid"><div class="card"><span class="badge">NEW</span><div class="title">A</div></div><div class="card"><div class="title">B</div></div></div>')
			assert(c.length === 2, 'expected 2 cards; got ' + c.length)
			assert(c[0].badge && c[0].badge.text === 'NEW', 'badge text NEW; got ' + JSON.stringify(c[0].badge))
			assert(c[0].badge.color === '7C3AED', 'badge fill from var() class rule; got ' + c[0].badge.color)
		},
	},
	{
		name: 'parseCards CSS cascade: inline style overrides class rule (inline wins)',
		fn: async () => {
			const c = parseCards('<style>.card{background:#000000}</style><div class="grid"><div class="card" style="background:#1A1A24"><div class="title">A</div></div><div class="card"><div class="title">B</div></div></div>')
			assert(c.length === 2, 'expected 2 cards; got ' + c.length)
			assert(c[0].colors.cardFill === '1A1A24', 'inline overrides class rule; got ' + c[0].colors.cardFill)
			// second card has no inline → falls back to class rule
			assert(c[1].colors.cardFill === '000000', 'card1 cardFill from class rule; got ' + c[1].colors.cardFill)
		},
	},
	{
		name: 'parseCards CSS cascade: no <style>/no var() ⇒ identical to inline-only (regression guard)',
		fn: async () => {
			const c = parseCards('<div class="grid"><div class="card" style="background:#1a1a24;border:1px solid #2A2438"><span class="badge" style="background:#10B981">NEW</span><div class="title">X</div></div><div class="card"><div class="title">Y</div></div></div>')
			assert(c.length === 2, 'expected 2 cards; got ' + c.length)
			assert(c[0].badge.color === '10B981', 'badge fill unchanged; got ' + c[0].badge.color)
			assert(c[0].colors.borderColor === '2A2438', 'borderColor unchanged; got ' + c[0].colors.borderColor)
			assert(c[0].colors.cardFill === '1A1A24', 'cardFill unchanged; got ' + c[0].colors.cardFill)
			assert(c[0].title === 'X', 'title unchanged; got ' + c[0].title)
			assert(c[1].colors.cardFill === undefined, 'card1 has no fill (no class rule); got ' + c[1].colors.cardFill)
		},
	},
	// ── feature-parse-cards-icon-resolution.md: glyph identity + iconResolver hook + codepoints ──
	{
		name: 'parseCards icon-resolution 1: glyph identity preserved + distinguishable across cards',
		fn: async () => {
			const fa = parseCards('<div class="grid">' +
				'<div class="card"><i class="fas fa-users"></i><div class="title">Team</div></div>' +
				'<div class="card"><i class="fas fa-code"></i><b>Build</b></div></div>')
			assert(fa.length === 2, 'expected 2 cards; got ' + fa.length)
			assert(fa[0].icon.type === 'fontIcon', 'card0 fontIcon; got ' + JSON.stringify(fa[0].icon))
			assert(fa[0].icon.glyphName === 'users', "card0 glyphName 'users'; got " + fa[0].icon.glyphName)
			assert(fa[0].icon.className === 'fas fa-users', "card0 className 'fas fa-users'; got " + fa[0].icon.className)
			assert(fa[0].icon.fontFamily === 'fa', "card0 fontFamily 'fa'; got " + fa[0].icon.fontFamily)
			assert(fa[1].icon.glyphName === 'code', "card1 glyphName 'code' (distinguishable); got " + fa[1].icon.glyphName)
		},
	},
	{
		name: 'parseCards icon-resolution 2: iconResolver upgrades fontIcon → svg (unresolved falls back)',
		fn: async () => {
			const MAP = {
				'fa-users': [{ d: 'M0 0L10 0L10 10Z', viewBox: { w: 512, h: 512 }, fill: '7C3AED', mode: 'fill' }],
			}
			const res = parseCards('<div class="grid">' +
				'<div class="card"><i class="fas fa-users"></i><div class="title">Team</div></div>' +
				'<div class="card"><i class="fas fa-code"></i><div class="title">Build</div></div></div>',
			{ iconResolver: (cls, fam, glyph) => MAP['fa-' + glyph] || null })
			assert(res[0].icon.type === 'svg', 'card0 resolved to svg; got ' + JSON.stringify(res[0].icon))
			assert(res[0].icon.parts[0].d.startsWith('M'), 'card0 svg part path; got ' + JSON.stringify(res[0].icon.parts[0]))
			assert(res[1].icon.type === 'fontIcon' && res[1].icon.glyphName === 'code', 'card1 glyph-aware fallback; got ' + JSON.stringify(res[1].icon))
		},
	},
	{
		name: 'parseCards icon-resolution 3: iconResolver returning null falls back cleanly (no throw)',
		fn: async () => {
			const none = parseCards('<div class="grid">' +
				'<div class="card"><i class="fas fa-ghost"></i><div class="title">A</div></div>' +
				'<div class="card"><i class="fas fa-ghost"></i><div class="title">B</div></div></div>',
			{ iconResolver: () => null })
			assert(none.length === 2, 'expected 2 cards; got ' + none.length)
			assert(none[0].icon.type === 'fontIcon', 'card0 fontIcon fallback; got ' + JSON.stringify(none[0].icon))
			assert(none[0].icon.glyphName === 'ghost', "card0 glyphName 'ghost'; got " + none[0].icon.glyphName)
		},
	},
	{
		name: 'parseCards icon-resolution 4: inline <style> ::before content → codepoint on char',
		fn: async () => {
			const cp = parseCards('<style>.fa-users::before{content:"\\f0c0"}</style><div class="grid">' +
				'<div class="card"><i class="fas fa-users"></i><div class="title">A</div></div>' +
				'<div class="card"><i class="fas fa-users"></i><div class="title">B</div></div></div>')
			assert(cp.length === 2, 'expected 2 cards; got ' + cp.length)
			assert(cp[0].icon.type === 'fontIcon', 'card0 fontIcon; got ' + JSON.stringify(cp[0].icon))
			assert(cp[0].icon.char === '\uf0c0', 'card0 char from ::before codepoint; got ' + JSON.stringify(cp[0].icon.char))
		},
	},
	{
		name: 'parseCards icon-resolution 5: inline <svg> still wins over a font icon (precedence unchanged)',
		fn: async () => {
			const svg = parseCards('<div class="grid">' +
				'<div class="card"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><i class="fas fa-users"></i><div class="title">A</div></div>' +
				'<div class="card"><div class="title">B</div></div></div>')
			assert(svg.length === 2, 'expected 2 cards; got ' + svg.length)
			assert(svg[0].icon.type === 'svg', 'card0 svg wins over font icon; got ' + JSON.stringify(svg[0].icon))
		},
	},
	{
		name: 'parseCards sibling adoption: grid + 1 straggler → all adopted (6 total)',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>Card1</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>Card2</div></div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>Card3</div></div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M2 2"/></svg><div>Card4</div></div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M3 3"/></svg><div>Card5</div></div>' +
				'</div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M4 4"/></svg><div>Card6</div></div>'
			const cards = parseCards(html)
			assert(cards.length === 6, 'expected 6 cards (5 + 1 adopted); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: stops at non-matching sibling',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div></div>' +
				'</div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>C</div></div>' +
				'<p>Not a card</p>'
			const cards = parseCards(html)
			assert(cards.length === 3, 'expected 3 cards (2 + 1 adopted, paragraph stops); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: never adopts blockquote/quote/callout',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div></div>' +
				'</div>' +
				'<div class="testimonial-card"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>Nope</div></div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards (testimonial not adopted); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: structurally dissimilar (too many children) not adopted',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div><div>x</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div><div>y</div></div>' +
				'</div>' +
				'<div><div>1</div><div>2</div><div>3</div><div>4</div><div>5</div><div>6</div><div>7</div><div>8</div></div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards (dissimilar sibling not adopted); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: two-row class-matched grid → no duplicate adoption (regression)',
		fn: async () => {
			// 6 class-matched cards split across two row wrappers: row 2 contains already-detected
			// cards and must be SKIPPED, not adopted as a 7th card. A straggler after row 2 is
			// still reachable and adopted.
			const card = (t) => '<div class="feature-card"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div class="card-title">' + t + '</div></div>'
			const html =
				'<div class="row">' + card('A') + card('B') + card('C') + '</div>' +
				'<div class="row">' + card('D') + card('E') + card('F') + '</div>' +
				card('G')
			const cards = parseCards(html)
			assert(cards.length === 7, 'expected 7 cards (6 in two rows + 1 straggler, no duplicates); got ' + cards.length)
			const titles = cards.map(c => c.title)
			assert(new Set(titles).size === 7, 'expected 7 unique titles; got ' + JSON.stringify(titles))
		},
	},
	{
		name: 'parseCards sibling adoption: a following grid container is never adopted as a card',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div></div>' +
				'</div>' +
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>C</div></div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M2 2"/></svg><div>D</div></div>' +
				'</div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards (second grid not swallowed as one card); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: prose sibling (icon + long text, no title) not adopted',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div></div>' +
				'</div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M1 1"/></svg>' +
				'<span>All performance figures are illustrative and were measured on internal preview hardware under synthetic load.</span></div>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards (footnote prose not adopted); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: multiple consecutive stragglers all adopted',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div></div>' +
				'</div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>C</div></div>' +
				'<div><svg viewBox="0 0 24 24"><path d="M2 2"/></svg><div>D</div></div>'
			const cards = parseCards(html)
			assert(cards.length === 4, 'expected 4 cards (2 + 2 consecutive stragglers); got ' + cards.length)
		},
	},
	{
		name: 'parseCards sibling adoption: bare <blockquote> sibling never adopted',
		fn: async () => {
			const html =
				'<div style="display:grid">' +
				'<div><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg><div>A</div></div>' +
				'<div><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16"/></svg><div>B</div></div>' +
				'</div>' +
				'<blockquote><svg viewBox="0 0 24 24"><path d="M1 1"/></svg><div>Wise words</div></blockquote>'
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards (blockquote not adopted); got ' + cards.length)
		},
	},
	// ── foreign framework correctness (Fix 1–4 regression tests) ──────────────────────────
	{
		name: 'parseCards foreign: Bootstrap card-body/card-text not confused as description container',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/bootstrap-cards.html'), 'utf8')
			const cards = parseCards(html)
			assert(cards.length === 3, 'expected 3 Bootstrap cards; got ' + cards.length)
			assert(cards[0].title === 'Authentication', 'card0 title; got ' + cards[0].title)
			assert(cards[1].title === 'Authorization', 'card1 title; got ' + cards[1].title)
			assert(cards[2].title === 'Encryption', 'card2 title; got ' + cards[2].title)
			assert(cards[0].description === 'Secure login with OAuth2 and MFA support.', 'card0 desc; got ' + cards[0].description)
			assert(cards[1].description === 'Role-based access control for all endpoints.', 'card1 desc; got ' + cards[1].description)
			assert(cards[2].description === 'AES-256 encryption at rest and in transit.', 'card2 desc; got ' + cards[2].description)
		},
	},
	{
		name: 'parseCards foreign: Tailwind text-lg/text-gray-600 do not confuse title/desc extraction',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/tailwind-cards.html'), 'utf8')
			const cards = parseCards(html)
			assert(cards.length === 3, 'expected 3 Tailwind cards; got ' + cards.length)
			assert(cards[0].title === 'Fast Delivery', 'card0 title; got ' + cards[0].title)
			assert(cards[1].title === 'Easy Returns', 'card1 title; got ' + cards[1].title)
			assert(cards[2].title === '24/7 Support', 'card2 title; got ' + cards[2].title)
			assert(cards[0].description === 'Ship in under 24 hours worldwide.', 'card0 desc; got ' + cards[0].description)
			assert(cards[1].description === '30-day hassle-free return policy.', 'card1 desc; got ' + cards[1].description)
			assert(cards[2].description === 'Always here when you need us.', 'card2 desc; got ' + cards[2].description)
		},
	},
	{
		name: 'parseCards foreign: MUI h6 titles beat MuiChip-label (heading preferred over class hit)',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/mui-cards.html'), 'utf8')
			const cards = parseCards(html)
			assert(cards.length === 3, 'expected 3 MUI cards; got ' + cards.length)
			assert(cards[0].title === 'Dashboard', 'card0 title from h6; got ' + cards[0].title)
			assert(cards[1].title === 'Reports', 'card1 title from h6; got ' + cards[1].title)
			assert(cards[2].title === 'Settings', 'card2 title from h6; got ' + cards[2].title)
			assert(cards[0].description === 'View analytics and metrics.', 'card0 desc; got ' + cards[0].description)
			assert(cards[1].description === 'Generate custom PDF reports.', 'card1 desc; got ' + cards[1].description)
			assert(cards[2].description === 'Configure system preferences.', 'card2 desc; got ' + cards[2].description)
		},
	},
	{
		name: 'parseCards foreign: direct text nodes collected by textBlocks (list-group-item)',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/list-group-text-nodes.html'), 'utf8')
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 list-group cards; got ' + cards.length)
			assert(cards[0].title === 'First item text', 'card0 title from direct text; got ' + cards[0].title)
			assert(cards[1].title === 'Second item text', 'card1 title from direct text; got ' + cards[1].title)
		},
	},
	{
		name: 'parseBadges anchored regex: no false-positives on vintage/caterpillar/heritage-tagline',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/badges-false-positive.html'), 'utf8')
			const badges = parseBadges(html)
			assert(badges.length === 3, 'expected 3 real badges; got ' + badges.length + ' → ' + JSON.stringify(badges))
			assert(badges[0] === 'New', 'badge0 New; got ' + badges[0])
			assert(badges[1] === 'Sale', 'badge1 Sale; got ' + badges[1])
			assert(badges[2] === 'Hot', 'badge2 Hot; got ' + badges[2])
		},
	},
	{
		name: 'parseQuote: WHATWG figure > blockquote + figcaption attribution',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/quote-whatwg.html'), 'utf8')
			const figure = html.match(/<div id="figure-quote">[\s\S]*?<\/div>\s*\n/)[0]
			const q = parseQuote(figure)
			assert(q !== null, 'parseQuote returned null for figure pattern')
			assert(q.attribution === 'William Gibson', 'attribution; got ' + q.attribution)
			assert(q.text.includes('future is already here'), 'text; got ' + q.text)
		},
	},
	{
		name: 'parseQuote: footer attribution inside blockquote',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/quote-whatwg.html'), 'utf8')
			const footer = html.match(/<div id="footer-quote">[\s\S]*?<\/div>\s*\n/)[0]
			const q = parseQuote(footer)
			assert(q !== null, 'parseQuote returned null for footer pattern')
			assert(q.attribution === 'Arthur C. Clarke', 'attribution; got ' + q.attribution)
			assert(q.text.includes('sufficiently advanced technology'), 'text; got ' + q.text)
		},
	},
	{
		name: 'parseQuote: inline <q> element supported',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/quote-whatwg.html'), 'utf8')
			const qEl = html.match(/<div id="q-element">[\s\S]*?<\/div>\s*\n/)[0]
			const q = parseQuote(qEl)
			assert(q !== null, 'parseQuote returned null for <q> element')
			assert(q.text.includes('To be or not to be'), 'text; got ' + q.text)
		},
	},
	{
		name: 'parseQuote: CJK quote glyphs stripped',
		fn: async () => {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/quote-whatwg.html'), 'utf8')
			const cjk = html.match(/<div id="cjk-quote">[\s\S]*?<\/div>\s*$/m)[0]
			const q = parseQuote(cjk)
			assert(q !== null, 'parseQuote returned null for CJK quote')
			assert(!q.text.includes('\u300C') && !q.text.includes('\u300D'), 'CJK glyphs not stripped; got ' + q.text)
			assert(q.text === '未来はすでにここにある', 'text; got ' + q.text)
		},
	},
	// ── Slice 7: Pattern options exposure ─────────────────────────────────────────────
	{
		name: 'parseCards foreign: custom titlePattern/descPattern match German .titel/.beschreibung classes',
		fn () {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/cards-custom-pattern.html'), 'utf8')
			const cards = parseCards(html, {
				containerPattern: /(?:^|-)grid\b/,
				cardPattern: /(?:^|-)(karte)\b/,
				titlePattern: /(?:^|-)(titel)$/,
				descPattern: /(?:^|-)(beschreibung)$/,
			})
			assert(cards.length === 2, 'expected 2 cards; got ' + cards.length)
			assert(cards[0].title === 'Erste Karte', 'card[0].title; got ' + cards[0].title)
			assert(cards[1].title === 'Zweite Karte', 'card[1].title; got ' + cards[1].title)
			assert(cards[0].description === 'Beschreibung der ersten Karte', 'card[0].desc; got ' + cards[0].description)
			assert(cards[1].description === 'Beschreibung der zweiten Karte', 'card[1].desc; got ' + cards[1].description)
		},
	},
	{
		name: 'foreign — Bootstrap Icons detected via broadened icon gate',
		fn () {
			const html = fs.readFileSync(path.join(__dirname, 'fixtures/foreign/cards-bootstrap-icon.html'), 'utf8')
			const cards = parseCards(html)
			assert(cards.length === 2, 'expected 2 cards; got ' + cards.length)
			assert(cards[0].icon && cards[0].icon.type === 'fontIcon', 'card[0] should have fontIcon; got ' + JSON.stringify(cards[0].icon))
			assert(cards[0].icon.fontFamily === 'bi', 'card[0].icon.fontFamily; got ' + cards[0].icon.fontFamily)
			assert(cards[0].icon.fontFace === 'Bootstrap Icons', 'card[0].icon.fontFace; got ' + cards[0].icon.fontFace)
			assert(cards[0].icon.glyphName === 'gear', 'card[0].icon.glyphName; got ' + cards[0].icon.glyphName)
			assert(cards[1].icon && cards[1].icon.fontFamily === 'bi', 'card[1] icon family; got ' + JSON.stringify(cards[1].icon))
			assert(cards[1].icon.glyphName === 'person', 'card[1].icon.glyphName; got ' + cards[1].icon.glyphName)
		},
	},
]
