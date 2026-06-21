'use strict'

// SAU-69 (library) — transparencyFromColor()/transparencyOf() must read alpha through the SAME
// color-convert path normalizeColor uses, so colour and alpha coverage stay in lockstep. After
// SAU-67 routed colour resolution through normalizeColor, a card border written as
// `oklch(... / .4)` / `rgb(0 0 0 / .4)` / `lab(... / .4)` resolved its COLOUR but silently dropped
// its TRANSPARENCY. These tests drive the live consumer (parseCards border-alpha) against the BUILT
// bundle (src/bld/utils.cjs.js) and assert the new alpha coverage, plus default-off for opaque.

const { parseCards } = require('../src/bld/utils.cjs.js')
const { assert } = require('./helpers')

// Two identical cards in a grid so parseCards recognises a ≥2-card grid.
function gridWithBorder(borderDecl) {
	const card = '<div class="card" style="' + borderDecl + '"><div class="title">A</div></div>'
	return parseCards('<div class="grid">' + card + card.replace('>A<', '>B<') + '</div>')
}

module.exports = [
	{
		name: 'SAU-69: modern slash-syntax rgb(0 0 0 / .4) border → borderTransparency 60',
		fn: async () => {
			const a = gridWithBorder('border:2px solid rgb(0 0 0 / .4)')
			assert(a.length === 2, 'expected 2 cards; got ' + a.length)
			assert(a[0].colors.borderTransparency === 60, 'expected 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: oklch(0.7 0.1 30 / 0.4) border → borderTransparency 60',
		fn: async () => {
			const a = gridWithBorder('border:2px solid oklch(0.7 0.1 30 / 0.4)')
			assert(a[0].colors.borderTransparency === 60, 'expected 60; got ' + a[0].colors.borderTransparency)
			assert(/^[0-9A-F]{6}$/.test(a[0].colors.borderColor), 'borderColor 6-hex; got ' + a[0].colors.borderColor)
		},
	},
	{
		name: 'SAU-69: lab(50% 40 30 / 0.25) border → borderTransparency 75',
		fn: async () => {
			const a = gridWithBorder('border:2px solid lab(50% 40 30 / 0.25)')
			assert(a[0].colors.borderTransparency === 75, 'expected 75; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: hsla(...) comma-form border → borderTransparency 60 (unchanged coverage)',
		fn: async () => {
			const a = gridWithBorder('border:2px solid hsla(200, 50%, 40%, 0.4)')
			assert(a[0].colors.borderTransparency === 60, 'expected 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: modern slash hsl(200 50% 40% / .4) border → borderTransparency 60',
		fn: async () => {
			const a = gridWithBorder('border:2px solid hsl(200 50% 40% / .4)')
			assert(a[0].colors.borderTransparency === 60, 'expected 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: hwb(200 30% 40% / .5) border → borderTransparency 50',
		fn: async () => {
			const a = gridWithBorder('border:2px solid hwb(200 30% 40% / .5)')
			assert(a[0].colors.borderTransparency === 50, 'expected 50; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: 8-digit hex #11223366 border → borderTransparency 60',
		fn: async () => {
			const a = gridWithBorder('border:2px solid #11223366')
			assert(a[0].colors.borderTransparency === 60, 'expected 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: % alpha rgb(0 0 0 / 40%) border → borderTransparency 60',
		fn: async () => {
			const a = gridWithBorder('border:2px solid rgb(0 0 0 / 40%)')
			assert(a[0].colors.borderTransparency === 60, 'expected 60; got ' + a[0].colors.borderTransparency)
		},
	},
	{
		name: 'SAU-69: opaque oklch / rgb() / 6-hex borders → borderTransparency omitted (default-off)',
		fn: async () => {
			for (const decl of ['border:2px solid oklch(0.7 0.1 30)', 'border:2px solid rgb(10 20 30)', 'border:2px solid #112233']) {
				const a = gridWithBorder(decl)
				assert(a[0].colors.borderTransparency === undefined, decl + ' → expected undefined; got ' + a[0].colors.borderTransparency)
			}
		},
	},
]
