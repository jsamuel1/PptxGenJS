const assert = require('assert')
const { relativeLuminance, contrastRatio, inkForFill } = require('../src/bld/utils.cjs.js')

module.exports = [
	{ name: 'relativeLuminance: white = 1.0', fn: () => assert.strictEqual(relativeLuminance('FFFFFF'), 1) },
	{ name: 'relativeLuminance: black = 0.0', fn: () => assert.strictEqual(relativeLuminance('000000'), 0) },
	{ name: 'contrastRatio: black/white = 21:1', fn: () => assert.strictEqual(contrastRatio('000000', 'FFFFFF'), 21) },
	{ name: 'inkForFill: white bg → dark ink', fn: () => assert.strictEqual(inkForFill('FFFFFF'), '1F2937') },
	{ name: 'inkForFill: dark bg → light ink', fn: () => assert.strictEqual(inkForFill('1E293B'), 'FFFFFF') },
	{ name: 'addCard white fill gives ≥4.5:1 contrast', fn: () => {
		const ink = inkForFill('FFFFFF')
		assert.ok(contrastRatio('FFFFFF', ink) >= 4.5, `contrast ${contrastRatio('FFFFFF', ink)} < 4.5`)
	}},
	{ name: 'addCallout body text default is luminance-derived ink (≥4.5:1 on pale fill FFF3CD)', fn: () => {
		// Spec case: addCallout({fill:'FFF3CD'}) must NOT default to hardcoded white
		// (which gives 1.108:1). The default body ink is inkForFill(fill).
		const ink = inkForFill('FFF3CD')
		assert.ok(contrastRatio('FFF3CD', ink) >= 4.5, `contrast ${contrastRatio('FFF3CD', ink)} < 4.5`)
	}},
	{ name: 'addCard default dark fill gives ≥4.5:1 contrast', fn: () => {
		const ink = inkForFill('1E293B')
		assert.ok(contrastRatio('1E293B', ink) >= 4.5, `contrast ${contrastRatio('1E293B', ink)} < 4.5`)
	}},
	{ name: 'inkForFill: mid-gray threshold correct', fn: () => {
		// #767676 has luminance ~0.181, above 0.179 → should get dark ink
		assert.strictEqual(inkForFill('767676'), '1F2937')
	}},
]
