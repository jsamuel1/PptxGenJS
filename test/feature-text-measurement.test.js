'use strict'
/**
 * Tests for measureTextWidth (docs/features/feature-text-measurement-from-font.md).
 *
 * AC1: CJK wider than same-length Latin at same fontSize.
 * AC2: CJK addBadge auto-width in OOXML ≥ measured text width.
 * AC3: ASCII badge auto-width ≥ its measured text width (no clip; badge always covers the glyph run).
 */
const assert = require('assert')
const JSZip = require('jszip')
const PptxGenJS = require('../src/bld/pptxgen.cjs.js')
const { measureTextWidth } = require('../src/bld/utils.cjs.js')

const EMU = 914400  // EMU per inch

async function badgeCx(text, opts) {
	const pres = new PptxGenJS()
	const slide = pres.addSlide()
	slide.addBadge({ x: 1, y: 1, text, ...opts })
	const buf = await pres.stream()
	const zip = await JSZip.loadAsync(buf)
	const entry = zip.file('ppt/slides/slide1.xml')
	if (!entry) throw new Error('slide1.xml missing')
	const xml = await entry.async('string')
	// The slide XML contains multiple <a:ext> elements; the badge shape is the first with cx > 0.
	const matches = [...xml.matchAll(/<a:ext cx="(\d+)" cy="\d+"\/>/g)]
	const m = matches.find(match => parseInt(match[1], 10) > 0)
	if (!m) throw new Error('no non-zero <a:ext cx found in: ' + xml.slice(0, 400))
	return parseInt(m[1], 10)
}

module.exports = [
	// ── AC1: CJK > Latin (pure unit test, no OOXML) ───────────────────────────
	{
		name: 'measureTextWidth: CJK is wider than same-length Latin at same fontSize',
		fn: () => {
			const cjk   = measureTextWidth('設定', { fontSize: 12 })
			const latin = measureTextWidth('ab', { fontSize: 12 })
			assert.ok(cjk > latin, `CJK (${cjk.toFixed(4)}) should be wider than Latin (${latin.toFixed(4)})`)
		},
	},
	{
		name: 'measureTextWidth: scales linearly with fontSize',
		fn: () => {
			const w8  = measureTextWidth('Hello', { fontSize: 8 })
			const w16 = measureTextWidth('Hello', { fontSize: 16 })
			assert.ok(Math.abs(w16 / w8 - 2) < 0.01, `expected 2× ratio, got ${(w16 / w8).toFixed(4)}`)
		},
	},
	{
		name: 'measureTextWidth: empty string returns 0',
		fn: () => {
			assert.strictEqual(measureTextWidth('', { fontSize: 12 }), 0)
		},
	},
	{
		name: 'measureTextWidth: fallbackEmFactor overrides per-codepoint factor',
		fn: () => {
			// With fallbackEmFactor=1.0 all chars are treated as wide (CJK em-factor).
			const w_wide  = measureTextWidth('ab', { fontSize: 12, fallbackEmFactor: 1.0 })
			const w_cjk   = measureTextWidth('ab', { fontSize: 12 })
			assert.ok(w_wide > w_cjk, `fallbackEmFactor=1.0 (${w_wide}) should be wider than default 0.5 (${w_cjk})`)
		},
	},

	// ── AC2: CJK addBadge auto-width ≥ measured glyph run ────────────────────
	{
		name: 'addBadge CJK pill: cx in OOXML ≥ measured text width',
		fn: async () => {
			const text = '設定'
			const fontSize = 8
			const cx = await badgeCx(text, { fontSize })
			const measured = measureTextWidth(text, { fontSize })
			assert.ok(
				cx >= Math.round(measured * EMU),
				`badge cx ${cx} EMU < measured ${Math.round(measured * EMU)} EMU (${measured.toFixed(4)} in)`,
			)
		},
	},
	{
		name: 'addBadge CJK wider than same-length Latin badge',
		fn: async () => {
			const cjkCx   = await badgeCx('設定', { fontSize: 8 })
			const latinCx = await badgeCx('ab', { fontSize: 8 })
			assert.ok(cjkCx > latinCx, `CJK badge cx ${cjkCx} should be > Latin ${latinCx}`)
		},
	},

	// ── AC3: ASCII badge correctness — badge always fits the text ─────────────
	{
		name: 'addBadge ASCII pill: cx ≥ measured text width (no clipping)',
		fn: async () => {
			const text = 'Hello'
			const fontSize = 8
			const cx = await badgeCx(text, { fontSize })
			const measured = measureTextWidth(text, { fontSize })
			assert.ok(
				cx >= Math.round(measured * EMU),
				`badge cx ${cx} EMU < measured ${Math.round(measured * EMU)} EMU — text would clip`,
			)
		},
	},
	{
		name: 'addBadge ASCII pill: cx is positive (non-degenerate)',
		fn: async () => {
			const cx = await badgeCx('OK', { fontSize: 8 })
			assert.ok(cx > 0, `expected positive cx, got ${cx}`)
		},
	},
]
