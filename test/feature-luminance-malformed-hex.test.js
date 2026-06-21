'use strict'

// Feature/regression (SAU-81): relativeLuminance must not crash on malformed hex.
// A malformed/empty/odd-length/non-hex string used to throw via the `.match(/.{2}/g)!`
// non-null assertion. It now normalises/validates to 6-hex and returns mid-luminance (0.5)
// for invalid input — clamp-don't-crash (ADR-0005) — keeping inkForFill/contrastRatio sane.
// Valid 6-hex behaviour is unchanged (byte-identical, ADR-0006).
const assert = require('assert')
// Import through the BUILT PUBLIC ENTRY (TESTING.md rule 1).
const { relativeLuminance, contrastRatio, inkForFill } = require('../src/bld/utils.cjs.js')

const BAD = ['', 'fff', 'xyz', 'abcde', '12345', '#zz', 'gggggg']

module.exports = [
	{ name: 'relativeLuminance: malformed hex does not throw', fn: () => {
		for (const v of BAD) assert.doesNotThrow(() => relativeLuminance(v), `threw on ${JSON.stringify(v)}`)
	}},
	{ name: 'relativeLuminance: malformed hex → sane mid-luminance (0..1)', fn: () => {
		for (const v of BAD) {
			const l = relativeLuminance(v)
			assert.ok(Number.isFinite(l) && l >= 0 && l <= 1, `lum ${l} out of range for ${JSON.stringify(v)}`)
		}
		assert.strictEqual(relativeLuminance(''), 0.5)
		assert.strictEqual(relativeLuminance('fff'), 0.5)
		assert.strictEqual(relativeLuminance('xyz'), 0.5)
		assert.strictEqual(relativeLuminance('abcde'), 0.5) // odd-length
	}},
	{ name: 'relativeLuminance: valid 6-hex unchanged (byte-identical)', fn: () => {
		assert.strictEqual(relativeLuminance('FFFFFF'), 1)
		assert.strictEqual(relativeLuminance('000000'), 0)
		assert.strictEqual(relativeLuminance('#FFFFFF'), 1) // leading # still stripped
	}},
	{ name: 'contrastRatio/inkForFill: malformed hex does not throw, sane output', fn: () => {
		assert.doesNotThrow(() => contrastRatio('xyz', 'FFFFFF'))
		assert.doesNotThrow(() => inkForFill(''))
		const ink = inkForFill('xyz')
		assert.ok(ink === '1F2937' || ink === 'FFFFFF', `unexpected ink ${ink}`)
		const cr = contrastRatio('', '')
		assert.ok(Number.isFinite(cr) && cr >= 1, `bad contrast ratio ${cr}`)
	}},
]
