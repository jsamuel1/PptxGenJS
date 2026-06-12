'use strict'

// Feature: icon pack style-prefix lookup — far/fab prefixed keys win over the
// bare fa- key, with fallback to fa- when no prefixed key exists.

const { assert } = require('./helpers')
const { resolveIconFonts } = require('../src/bld/utils.cjs.js')

const pack = {
	'far-user': { w: 448, h: 512, d: 'M-REGULAR-PATH' },
	'fa-user': { w: 448, h: 512, d: 'M-SOLID-PATH' },
	'fab-github': { w: 496, h: 512, d: 'M-BRAND-PATH' },
	'fa-github': { w: 496, h: 512, d: 'M-SOLID-GITHUB' },
}

module.exports = [
	{
		name: 'icon-pack-style-lookup: prefers far-user over fa-user when class contains "far"',
		fn: async () => {
			const html = '<i class="far fa-user"></i>'
			const result = await resolveIconFonts(html, { pack, useCdn: false })
			const parts = result.get('far fa-user')
			assert(parts, 'should resolve far fa-user')
			assert(parts[0].d === 'M-REGULAR-PATH', 'expected regular path, got ' + (parts[0] && parts[0].d))
		},
	},
	{
		name: 'icon-pack-style-lookup: prefers fab-github over fa-github when class contains "fab"',
		fn: async () => {
			const html = '<i class="fab fa-github"></i>'
			const result = await resolveIconFonts(html, { pack, useCdn: false })
			const parts = result.get('fab fa-github')
			assert(parts, 'should resolve fab fa-github')
			assert(parts[0].d === 'M-BRAND-PATH', 'expected brand path, got ' + (parts[0] && parts[0].d))
		},
	},
	{
		name: 'icon-pack-style-lookup: falls back to fa-name when no style-prefixed key exists',
		fn: async () => {
			const html = '<i class="far fa-github"></i>'
			const result = await resolveIconFonts(html, { pack, useCdn: false })
			const parts = result.get('far fa-github')
			assert(parts, 'should fall back to fa-github')
			assert(parts[0].d === 'M-SOLID-GITHUB', 'expected solid github path, got ' + (parts[0] && parts[0].d))
		},
	},
]
