'use strict'

// Run-level gradient glyph fill (RI-8). A `GradientFillProps` passed as a text `color`
// emits `<a:gradFill>` inside the run's `<a:rPr>` so the GLYPHS are gradient-filled
// (vs. shape-level `fill:{gradient}` which paints the text-box background behind the glyphs).
// A plain string/ThemeColor color keeps the byte-identical `<a:solidFill>` path (default-off).

const { build, readEntry, assert } = require('./helpers')

module.exports = [
	{
		name: 'text-gradient: color:{type:gradient} → run rPr has <a:gradFill> (2 stops + <a:lin>), no <a:solidFill>',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('Gradient glyphs', {
					x: 1, y: 1, w: 6, h: 1,
					color: { type: 'gradient', direction: 'horizontal', stops: [{ position: 0, color: 'FF0000' }, { position: 100, color: '0000FF' }] }
				})
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			// Isolate the run's rPr (between <a:rPr ...> and its close) — the gradient must be a child of the run props
			const m = xml.match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s)
			assert(m, 'expected an <a:rPr> run-properties element; got: ' + xml)
			const rPr = m[1]
			assert(rPr.includes('<a:gradFill'), 'expected <a:gradFill> inside the run rPr; got: ' + rPr)
			assert((rPr.match(/<a:gs /g) || []).length === 2, 'expected exactly 2 gradient stops; got: ' + rPr)
			assert(/<a:srgbClr val="FF0000"\/>/.test(rPr) && /<a:srgbClr val="0000FF"\/>/.test(rPr), 'expected both stop colors; got: ' + rPr)
			assert(/<a:lin ang="\d+" scaled="1"\/>/.test(rPr), 'expected <a:lin ang=.. scaled=1>; got: ' + rPr)
			// horizontal → ang=0
			assert(/<a:lin ang="0" scaled="1"\/>/.test(rPr), 'expected horizontal gradient ang=0; got: ' + rPr)
			// MUST NOT also emit a solid fill in the same run rPr
			assert(!rPr.includes('<a:solidFill>'), 'gradient run must NOT also carry <a:solidFill>; got: ' + rPr)
		}
	},
	{
		// DEFAULT-OFF regression-catch: a plain string color must keep the byte-identical solid path.
		name: 'text-gradient: plain string color still emits <a:solidFill> with <a:srgbClr> and NO <a:gradFill>',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('Solid glyphs', { x: 1, y: 1, w: 6, h: 1, color: 'FF0000' })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const m = xml.match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s)
			assert(m, 'expected an <a:rPr> run-properties element; got: ' + xml)
			const rPr = m[1]
			assert(rPr.includes('<a:solidFill><a:srgbClr val="FF0000"/></a:solidFill>'), 'expected solid fill for string color; got: ' + rPr)
			assert(!rPr.includes('<a:gradFill'), 'string color must NOT emit <a:gradFill>; got: ' + rPr)
		}
	},
	{
		// Angle mapping: vertical → 90° → 5400000 (60,000ths of a degree)
		name: 'text-gradient: direction:vertical → <a:lin ang="5400000">',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('Vertical', {
					x: 1, y: 1, w: 6, h: 1,
					color: { type: 'gradient', direction: 'vertical', stops: [{ position: 0, color: '00FF00' }, { position: 100, color: '0000FF' }] }
				})
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const rPr = xml.match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s)[1]
			assert(/<a:lin ang="5400000" scaled="1"\/>/.test(rPr), 'expected vertical gradient ang=5400000; got: ' + rPr)
		}
	},
	{
		// Clamp/guard-don't-crash: an empty stops gradient emits NO fill child and must not throw.
		name: 'text-gradient: empty stops → no fill child, no throw',
		fn: async () => {
			const { zip } = await build(p => {
				p.addSlide().addText('No stops', { x: 1, y: 1, w: 6, h: 1, color: { type: 'gradient', stops: [] } })
			})
			const xml = await readEntry(zip, 'ppt/slides/slide1.xml')
			const rPr = xml.match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s)[1]
			assert(!rPr.includes('<a:gradFill'), 'empty-stops gradient must emit no <a:gradFill>; got: ' + rPr)
			assert(!rPr.includes('<a:solidFill>'), 'empty-stops gradient must emit no <a:solidFill>; got: ' + rPr)
		}
	}
]
