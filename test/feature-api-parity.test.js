'use strict'
/**
 * Public API parity — the typed surface and the runtime surface of the `/utils` entry
 * must match exactly (see CONTRIBUTING.md "Definition of done — public API").
 *
 * Catches the two failure modes that have each shipped before:
 *  - exported at runtime but never declared in types/utils.d.ts (TypeScript consumers
 *    can't import it): decodeEntities (4.3.12), tokenizeCode/codeRuns
 *  - declared/spec'd but never exported from src/utils.ts (no consumer can reach it
 *    at all): the css-context layout helpers (4.3.13)
 */

const fs = require('fs')
const path = require('path')
const utils = require('../src/bld/utils.cjs.js')

/** Value (runtime) exports declared in types/utils.d.ts — functions/consts, not types. */
function declaredValueExports () {
	const dts = fs.readFileSync(path.join(__dirname, '..', 'types', 'utils.d.ts'), 'utf8')
	const names = new Set()
	const re = /^export\s+(?:declare\s+)?(?:function|const|let|var)\s+([A-Za-z0-9_$]+)/gm
	let m
	while ((m = re.exec(dts))) names.add(m[1])
	return names
}

function assert (cond, msg) { if (!cond) throw new Error(msg) }

module.exports = [
	{
		name: 'API parity: every value declared in types/utils.d.ts exists on the built /utils entry',
		fn: async () => {
			const missing = [...declaredValueExports()].filter(n => typeof utils[n] === 'undefined')
			assert(missing.length === 0,
				'declared in types/utils.d.ts but absent from the built runtime (consumers get undefined): ' + missing.join(', '))
		},
	},
	{
		name: 'API parity: every runtime export of the /utils entry is declared in types/utils.d.ts',
		fn: async () => {
			const declared = declaredValueExports()
			const undeclared = Object.keys(utils)
				.filter(k => k !== 'default' && k !== '__esModule' && typeof utils[k] !== 'undefined')
				.filter(n => !declared.has(n))
			assert(undeclared.length === 0,
				'exported at runtime but not declared in types/utils.d.ts (TypeScript consumers cannot see them): ' + undeclared.join(', '))
		},
	},
]
