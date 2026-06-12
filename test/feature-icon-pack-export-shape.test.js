'use strict'
const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

describe('icons-fa CJS export shape', () => {
	const icons = require('../src/bld/icons-fa.cjs.js')

	it('icons["fa-anchor"] has w, h, d', () => {
		assert.equal(typeof icons['fa-anchor'], 'object')
		assert.ok('w' in icons['fa-anchor'])
		assert.ok('h' in icons['fa-anchor'])
		assert.ok('d' in icons['fa-anchor'])
	})

	it('icons["fa-user"] has w, h, d', () => {
		assert.equal(typeof icons['fa-user'], 'object')
		assert.ok('w' in icons['fa-user'])
		assert.ok('h' in icons['fa-user'])
		assert.ok('d' in icons['fa-user'])
	})

	it('icons are NOT nested under a named key', () => {
		assert.equal(icons['FA_ICONS'], undefined)
	})
})
