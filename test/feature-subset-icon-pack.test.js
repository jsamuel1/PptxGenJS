'use strict'

// Feature: subsetIconPack utility (subset icon packs to a byte budget).

const { assert, assertEqual } = require('./helpers')
const { subsetIconPack } = require('../src/bld/utils.cjs.js')

const PACK = {
	heart: { w: 512, h: 512, d: 'M0 0z', popularity: 100 },
	star: { w: 576, h: 512, d: 'M1 1z', popularity: 90 },
	home: { w: 576, h: 512, d: 'M2 2z', popularity: 80 },
	bell: { w: 448, h: 512, d: 'M3 3z', popularity: 70 },
	cloud: { w: 640, h: 512, d: 'M4 4z', popularity: 60 },
}

module.exports = [
	{
		name: 'subsetIconPack: returns all icons (minus popularity) when no budget',
		fn: async () => {
			const result = subsetIconPack(PACK)
			assertEqual(Object.keys(result).length, 5, 'should have all 5 icons')
			assert(result.heart.w === 512 && result.heart.h === 512 && result.heart.d === 'M0 0z', 'heart entry correct')
			assert(!('popularity' in result.heart), 'popularity stripped')
		},
	},
	{
		name: 'subsetIconPack: include entries always present even with tiny budget',
		fn: async () => {
			const result = subsetIconPack(PACK, { include: ['cloud'], budget: 1 })
			assert('cloud' in result, 'cloud must be present')
			assertEqual(Object.keys(result).length, 1, 'only include entry fits')
		},
	},
	{
		name: 'subsetIconPack: deterministic output (same input → same output)',
		fn: async () => {
			const opts = { budget: 300 }
			const r1 = subsetIconPack(PACK, opts)
			const r2 = subsetIconPack(PACK, opts)
			assertEqual(JSON.stringify(r1), JSON.stringify(r2), 'must be identical')
		},
	},
	{
		name: 'subsetIconPack: budget enforcement — output length ≤ budget',
		fn: async () => {
			const budget = 100
			const result = subsetIconPack(PACK, { budget })
			const len = JSON.stringify(result).length
			assert(len <= budget, 'output length ' + len + ' exceeds budget ' + budget)
			assert(Object.keys(result).length < 5, 'should not contain all icons')
		},
	},
	{
		name: 'subsetIconPack: custom rank function works',
		fn: async () => {
			// Reverse: lower popularity = higher rank
			const rank = (_name, entry) => -(entry.popularity || 0)
			const result = subsetIconPack(PACK, { budget: 100, rank })
			const keys = Object.keys(result)
			// cloud (pop 60) should be first since it has highest custom rank (-60 > -70 etc.)
			assert(keys.includes('cloud'), 'cloud should be included with reversed rank')
			assert(!keys.includes('heart'), 'heart should be excluded (lowest custom rank)')
		},
	},
	{
		name: 'subsetIconPack: empty pack returns empty object',
		fn: async () => {
			const result = subsetIconPack({})
			assertEqual(JSON.stringify(result), '{}', 'must be empty object')
		},
	},
	{
		name: 'subsetIconPack: never mutates input',
		fn: async () => {
			const pack = { a: { w: 1, h: 1, d: 'x', popularity: 5 } }
			const before = JSON.stringify(pack)
			subsetIconPack(pack, { budget: 10 })
			assertEqual(JSON.stringify(pack), before, 'input must not be mutated')
		},
	},
	{
		name: 'subsetIconPack: equal rank uses alphabetical tie-break',
		fn: async () => {
			const pack = {
				zebra: { w: 1, h: 1, d: 'z', popularity: 50 },
				alpha: { w: 1, h: 1, d: 'a', popularity: 50 },
				mango: { w: 1, h: 1, d: 'm', popularity: 50 },
			}
			const result = subsetIconPack(pack, { budget: 5000 })
			const keys = Object.keys(result)
			// All should be present (budget large enough), sorted alphabetically for equal rank
			assertEqual(keys[0], 'alpha', 'alpha first')
			assertEqual(keys[1], 'mango', 'mango second')
			assertEqual(keys[2], 'zebra', 'zebra last')
		},
	},
	{
		name: 'subsetIconPack: icons without popularity ranked lowest',
		fn: async () => {
			const pack = {
				popular: { w: 1, h: 1, d: 'p', popularity: 10 },
				unknown: { w: 1, h: 1, d: 'u' },
			}
			// Budget large enough for one but not both
			const oneIconBudget = JSON.stringify({ popular: { w: 1, h: 1, d: 'p' } }).length
			const result = subsetIconPack(pack, { budget: oneIconBudget })
			assert('popular' in result, 'popular should be kept')
			assert(!('unknown' in result), 'unknown should be cut (no popularity)')
		},
	},
]
