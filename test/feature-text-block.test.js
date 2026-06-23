'use strict'
/**
 * Tests for measureTextBlock — wrapped-line-count + height/fit primitive built on measureTextWidth.
 *
 * AC1: a short string fits on one line (lines === 1).
 * AC2: a long string wraps to > 1 line at a given maxWidthIn.
 * AC3: CJK text height ≥ same char-count Latin (CJK wraps to more lines at the same box width).
 * AC4: an explicit \n forces a new line.
 * AC5: height = lines * fontSize * lineHeight / 72; empty string is one line; no divide-by-zero.
 */
const assert = require('assert')
const { measureTextBlock, measureTextWidth } = require('../src/bld/utils.cjs.js')

module.exports = [
	// ── AC1: short string → one line ──────────────────────────────────────────
	{
		name: 'measureTextBlock: short string fits on a single line',
		fn: () => {
			const r = measureTextBlock('Hello world', { fontSize: 12, maxWidthIn: 8 })
			assert.strictEqual(r.lines, 1, `expected 1 line, got ${r.lines}`)
			assert.ok(r.widthIn > 0, 'widthIn should be positive')
			assert.ok(Math.abs(r.heightIn - (1 * 12 * 1.2) / 72) < 1e-9, `heightIn ${r.heightIn}`)
		},
	},

	// ── AC2: long string wraps to > 1 line ────────────────────────────────────
	{
		name: 'measureTextBlock: long string wraps to more than one line',
		fn: () => {
			const text = 'The quick brown fox jumps over the lazy dog again and again and again'
			const r = measureTextBlock(text, { fontSize: 18, maxWidthIn: 2 })
			assert.ok(r.lines > 1, `expected wrap to >1 line, got ${r.lines}`)
			// Widest wrapped line must fit the box (or be a single oversized word — none here).
			assert.ok(r.widthIn <= 2 + 1e-9, `widest line ${r.widthIn} should fit maxWidthIn=2`)
			assert.ok(Math.abs(r.heightIn - (r.lines * 18 * 1.2) / 72) < 1e-9, 'height = lines*fs*lh/72')
		},
	},

	// ── AC3: CJK height ≥ same char-count Latin ───────────────────────────────
	{
		name: 'measureTextBlock: CJK heightIn ≥ same char-count Latin at same box width',
		fn: () => {
			// 12 chars each; CJK glyphs are ~1.0 em vs Latin ~0.5 em → CJK wraps to more lines.
			const cjk = measureTextBlock('設定設定設定設定設定設定', { fontSize: 18, maxWidthIn: 1.2 })
			const latin = measureTextBlock('abcdefghijkl', { fontSize: 18, maxWidthIn: 1.2 })
			assert.ok(
				cjk.heightIn >= latin.heightIn,
				`CJK height ${cjk.heightIn.toFixed(4)} should be ≥ Latin ${latin.heightIn.toFixed(4)}`,
			)
			assert.ok(cjk.lines >= latin.lines, `CJK lines ${cjk.lines} ≥ Latin lines ${latin.lines}`)
		},
	},

	// ── AC4: explicit \n forces a new line ────────────────────────────────────
	{
		name: 'measureTextBlock: explicit \\n forces a new line',
		fn: () => {
			const one = measureTextBlock('Alpha Beta', { fontSize: 12, maxWidthIn: 8 })
			const two = measureTextBlock('Alpha\nBeta', { fontSize: 12, maxWidthIn: 8 })
			assert.strictEqual(one.lines, 1, `no-newline should be 1 line, got ${one.lines}`)
			assert.strictEqual(two.lines, 2, `newline should force 2 lines, got ${two.lines}`)
		},
	},
	{
		name: 'measureTextBlock: \\r\\n is treated as a single hard break',
		fn: () => {
			const r = measureTextBlock('a\r\nb\r\nc', { fontSize: 12, maxWidthIn: 8 })
			assert.strictEqual(r.lines, 3, `expected 3 lines, got ${r.lines}`)
		},
	},

	// ── AC5: height formula, empty string, divide-by-zero safety ──────────────
	{
		name: 'measureTextBlock: empty string is one line with zero width',
		fn: () => {
			const r = measureTextBlock('', { fontSize: 12, maxWidthIn: 8 })
			assert.strictEqual(r.lines, 1, `empty string should be 1 line, got ${r.lines}`)
			assert.strictEqual(r.widthIn, 0, `empty string widthIn should be 0, got ${r.widthIn}`)
		},
	},
	{
		name: 'measureTextBlock: custom lineHeight scales height',
		fn: () => {
			const r = measureTextBlock('Two\nLines', { fontSize: 20, maxWidthIn: 8, lineHeight: 1.5 })
			assert.strictEqual(r.lines, 2)
			assert.ok(Math.abs(r.heightIn - (2 * 20 * 1.5) / 72) < 1e-9, `heightIn ${r.heightIn}`)
		},
	},
	{
		name: 'measureTextBlock: maxWidthIn <= 0 never divides by zero (no wrapping)',
		fn: () => {
			const r = measureTextBlock('a very long single hard line of words', { fontSize: 12, maxWidthIn: 0 })
			assert.strictEqual(r.lines, 1, `maxWidthIn=0 should be 1 line, got ${r.lines}`)
			assert.ok(Number.isFinite(r.heightIn) && r.heightIn > 0, 'heightIn finite & positive')
			assert.ok(Number.isFinite(r.widthIn), 'widthIn finite')
		},
	},
	{
		name: 'measureTextBlock: a single oversized word still occupies one line',
		fn: () => {
			const word = 'supercalifragilisticexpialidocious'
			const r = measureTextBlock(word, { fontSize: 24, maxWidthIn: 0.5 })
			assert.strictEqual(r.lines, 1, `oversized word should be 1 line, got ${r.lines}`)
			// Its width is the full word width (greater than the box) — it never vanishes.
			assert.ok(r.widthIn > 0.5, `oversized word width ${r.widthIn} should exceed box`)
			assert.ok(Math.abs(r.widthIn - measureTextWidth(word, { fontSize: 24 })) < 1e-9)
		},
	},
]
