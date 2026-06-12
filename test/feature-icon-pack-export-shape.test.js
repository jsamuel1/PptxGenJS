'use strict'

// Feature: icons-fa CJS export shape — the pack is a flat name->glyph map,
// not nested under a named key.

const { assert } = require('./helpers')
const icons = require('../src/bld/icons-fa.cjs.js')

module.exports = [
	{
		name: 'icon-pack-export-shape: icons["fa-anchor"] has w, h, d',
		fn: async () => {
			assert(typeof icons['fa-anchor'] === 'object', 'fa-anchor must be an object')
			assert('w' in icons['fa-anchor'], 'fa-anchor must have w')
			assert('h' in icons['fa-anchor'], 'fa-anchor must have h')
			assert('d' in icons['fa-anchor'], 'fa-anchor must have d')
		},
	},
	{
		name: 'icon-pack-export-shape: icons["fa-user"] has w, h, d',
		fn: async () => {
			assert(typeof icons['fa-user'] === 'object', 'fa-user must be an object')
			assert('w' in icons['fa-user'], 'fa-user must have w')
			assert('h' in icons['fa-user'], 'fa-user must have h')
			assert('d' in icons['fa-user'], 'fa-user must have d')
		},
	},
	{
		name: 'icon-pack-export-shape: icons are NOT nested under a named key',
		fn: async () => {
			assert(icons['FA_ICONS'] === undefined, 'pack must not be nested under FA_ICONS')
		},
	},
]
