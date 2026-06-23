'use strict'
/**
 * Tests for fitFontSize — shrink-to-fit font sizer built on measureTextBlock.
 *
 * AC1: short text in a big box → fontSize === maxFontSize, fits === true.
 * AC2: a long paragraph in a small box → fontSize reduced below max, heightIn <= boxHeightIn, fits true.
 * AC3: an impossible case (tiny box) → fits === false at minFontSize.
 * AC4: monotonic — a bigger box never yields a smaller chosen fontSize.
 * AC5: guards — boxWidthIn <= 0 doesn't divide-by-zero / loop forever; step honoured; min>max collapses.
 */
const assert = require('assert')
const { fitFontSize, measureTextBlock } = require('../src/bld/utils.cjs.js')

module.exports = [
	// ── AC1: short text in a big box keeps the max size ───────────────────────
	{
		name: 'fitFontSize: short text in a big box returns maxFontSize, fits',
		fn: () => {
			const r = fitFontSize('Hello', { boxWidthIn: 10, boxHeightIn: 5, maxFontSize: 40 })
			assert.strictEqual(r.fontSize, 40, `expected 40, got ${r.fontSize}`)
			assert.strictEqual(r.fits, true, 'should fit')
			assert.ok(r.heightIn <= 5 + 1e-9, `heightIn ${r.heightIn} should be <= 5`)
			assert.ok(r.lines >= 1, 'lines >= 1')
		},
	},

	// ── AC2: long paragraph in a small box → reduced size that fits ───────────
	{
		name: 'fitFontSize: long paragraph in a small box shrinks below max and fits',
		fn: () => {
			const text =
				'The quick brown fox jumps over the lazy dog again and again while the rain ' +
				'falls steadily on the quiet little town near the river and the old stone bridge.'
			const opts = { boxWidthIn: 3, boxHeightIn: 1.2, maxFontSize: 36, minFontSize: 6 }
			const r = fitFontSize(text, opts)
			assert.ok(r.fontSize < 36, `expected reduced size, got ${r.fontSize}`)
			assert.ok(r.fontSize >= 6, `expected >= minFontSize 6, got ${r.fontSize}`)
			assert.strictEqual(r.fits, true, 'should fit at the reduced size')
			assert.ok(r.heightIn <= 1.2 + 1e-9, `heightIn ${r.heightIn} should be <= 1.2`)
			// Independent cross-check against measureTextBlock at the chosen size.
			const m = measureTextBlock(text, { fontSize: r.fontSize, maxWidthIn: 3 })
			assert.ok(Math.abs(m.heightIn - r.heightIn) < 1e-9, 'heightIn matches measureTextBlock')
			assert.ok(m.heightIn <= 1.2 + 1e-9, 'measured height fits the box')
			// One step bigger must NOT fit (it's the LARGEST fitting size).
			const bigger = measureTextBlock(text, { fontSize: r.fontSize + 0.5, maxWidthIn: 3 })
			assert.ok(bigger.heightIn > 1.2 + 1e-9, 'a half-point larger should overflow')
		},
	},

	// ── AC3: impossible (tiny box) → fits:false at minFontSize ────────────────
	{
		name: 'fitFontSize: impossible tiny box returns fits:false at minFontSize',
		fn: () => {
			const text = 'This paragraph cannot possibly fit in a sliver of a box no matter how small the font.'
			const r = fitFontSize(text, { boxWidthIn: 0.5, boxHeightIn: 0.05, maxFontSize: 40, minFontSize: 8 })
			assert.strictEqual(r.fits, false, 'should not fit')
			assert.strictEqual(r.fontSize, 8, `expected minFontSize 8, got ${r.fontSize}`)
			assert.ok(r.heightIn > 0.05, 'measured height overflows the box (reported anyway)')
		},
	},

	// ── AC4: monotonic — bigger box ⇒ fontSize >= ─────────────────────────────
	{
		name: 'fitFontSize: monotonic — a taller box never reduces the chosen fontSize',
		fn: () => {
			const text = 'Monotonicity check paragraph with enough words to wrap a few times in a narrow box here.'
			const base = { boxWidthIn: 4, maxFontSize: 32, minFontSize: 6 }
			let prev = 0
			for (const h of [0.4, 0.8, 1.5, 3.0, 6.0]) {
				const r = fitFontSize(text, { ...base, boxHeightIn: h })
				assert.ok(r.fontSize >= prev, `taller box ${h}in gave smaller font ${r.fontSize} < ${prev}`)
				prev = r.fontSize
			}
			// And a wider box (less wrapping) at fixed height is also >= a narrower one.
			const narrow = fitFontSize(text, { boxWidthIn: 2, boxHeightIn: 1.0, maxFontSize: 32, minFontSize: 6 })
			const wide = fitFontSize(text, { boxWidthIn: 6, boxHeightIn: 1.0, maxFontSize: 32, minFontSize: 6 })
			assert.ok(wide.fontSize >= narrow.fontSize, `wider box font ${wide.fontSize} < narrow ${narrow.fontSize}`)
		},
	},

	// ── AC5: guards — degenerate inputs are safe and terminate ────────────────
	{
		name: 'fitFontSize: guards boxWidthIn<=0, step, and min>max without looping/dividing by zero',
		fn: () => {
			// boxWidthIn <= 0 → measureTextBlock treats as no-wrap; must still return promptly.
			const r0 = fitFontSize('No wrap here', { boxWidthIn: 0, boxHeightIn: 5, maxFontSize: 24 })
			assert.ok(r0.fontSize >= 8 && r0.fontSize <= 24, `fontSize in range, got ${r0.fontSize}`)
			assert.strictEqual(typeof r0.fits, 'boolean', 'fits is boolean')

			// step honoured: integer step still selects max for tiny text.
			const rStep = fitFontSize('Hi', { boxWidthIn: 10, boxHeightIn: 5, maxFontSize: 40, step: 1 })
			assert.strictEqual(rStep.fontSize, 40, 'max still chosen with step 1')

			// min > max collapses to a single candidate at maxFontSize (no infinite loop).
			const rCollapse = fitFontSize('x', { boxWidthIn: 10, boxHeightIn: 5, maxFontSize: 12, minFontSize: 30 })
			assert.strictEqual(rCollapse.fontSize, 12, `collapsed to max 12, got ${rCollapse.fontSize}`)
			assert.strictEqual(rCollapse.fits, true, 'tiny text fits big box')

			// non-finite/<=0 step falls back to default and still terminates.
			const rBadStep = fitFontSize('x', { boxWidthIn: 10, boxHeightIn: 5, maxFontSize: 12, step: 0 })
			assert.strictEqual(rBadStep.fontSize, 12, `bad step fell back, got ${rBadStep.fontSize}`)
		},
	},
]
