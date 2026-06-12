'use strict'

// Feature: icon pack popularity ranking regression — ensures common icons survive budget cuts.

const { assert } = require('./helpers')
const { subsetIconPack } = require('../src/bld/utils.cjs.js')
const FA_ICONS = require('../src/bld/icons-fa.cjs.js')

module.exports = [
	{
		name: 'icon-pack-popularity: fa-user and fa-check survive 400KB budget',
		fn: async () => {
			const result = subsetIconPack(FA_ICONS, { budget: 400_000 })
			assert('fa-user' in result, 'fa-user must be present in subset')
			assert('fa-check' in result, 'fa-check must be present in subset')
		},
	},
	{
		name: 'icon-pack-popularity: subset respects 400KB budget',
		fn: async () => {
			const result = subsetIconPack(FA_ICONS, { budget: 400_000 })
			const len = JSON.stringify(result).length
			assert(len <= 400_000, 'subset JSON length ' + len + ' exceeds 400000')
		},
	},
]
