const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { resolveIconFonts } = require('../src/bld/utils.cjs.js')

describe('feature-icon-pack-style-lookup', () => {
	const pack = {
		'far-user': { w: 448, h: 512, d: 'M-REGULAR-PATH' },
		'fa-user': { w: 448, h: 512, d: 'M-SOLID-PATH' },
		'fab-github': { w: 496, h: 512, d: 'M-BRAND-PATH' },
		'fa-github': { w: 496, h: 512, d: 'M-SOLID-GITHUB' },
	}

	it('prefers far-user over fa-user when class contains "far"', async () => {
		const html = '<i class="far fa-user"></i>'
		const result = await resolveIconFonts(html, { pack, useCdn: false })
		const parts = result.get('far fa-user')
		assert.ok(parts, 'should resolve far fa-user')
		assert.equal(parts[0].d, 'M-REGULAR-PATH')
	})

	it('prefers fab-github over fa-github when class contains "fab"', async () => {
		const html = '<i class="fab fa-github"></i>'
		const result = await resolveIconFonts(html, { pack, useCdn: false })
		const parts = result.get('fab fa-github')
		assert.ok(parts, 'should resolve fab fa-github')
		assert.equal(parts[0].d, 'M-BRAND-PATH')
	})

	it('falls back to fa-name when no style-prefixed key exists', async () => {
		const html = '<i class="far fa-github"></i>'
		const result = await resolveIconFonts(html, { pack, useCdn: false })
		const parts = result.get('far fa-github')
		assert.ok(parts, 'should fall back to fa-github')
		assert.equal(parts[0].d, 'M-SOLID-GITHUB')
	})
})
