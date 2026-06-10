'use strict'

const { assert } = require('./helpers')

module.exports = [
	{
		name: 'tokenizeCode: JS source yields keyword/plain/operator/string/comment tokens',
		fn: async () => {
			const { tokenizeCode } = require('../src/bld/utils.cjs.js')
			const tokens = tokenizeCode('const x = "hi" // c', 'javascript')
			const kinds = tokens.map(t => t.token)
			assert(kinds.includes('keyword'), 'expected keyword token for "const"')
			assert(kinds.includes('string'), 'expected string token for "hi"')
			assert(kinds.includes('comment'), 'expected comment token for "// c"')
			assert(kinds.includes('operator'), 'expected operator token for "="')
			assert(kinds.includes('plain'), 'expected plain token for identifier "x"')
			assert(tokens[0].text === 'const', 'first token text should be "const"')
		},
	},
	{
		name: 'codeRuns: uses Courier New font and preserves 4-space indentation',
		fn: async () => {
			const { codeRuns } = require('../src/bld/utils.cjs.js')
			const runs = codeRuns('    const x = 1')
			assert(runs.length > 0, 'expected non-empty runs')
			assert(runs[0].options.fontFace === 'Courier New', 'expected Courier New font')
			assert(runs[0].options.fontSize === 12, 'expected fontSize 12')
			// First token should be the 4-space indentation
			assert(runs[0].text === '    ', 'expected leading 4 spaces preserved in first run')
		},
	},
	{
		name: 'codeRuns: highlightLines dims non-highlighted lines',
		fn: async () => {
			const { codeRuns } = require('../src/bld/utils.cjs.js')
			const source = 'a\nb\nc'
			const runs = codeRuns(source, { highlightLines: [2] })
			// Line 1 tokens should be dimmed (555555)
			assert(runs[0].options.color === '555555', 'line 1 should be dimmed to 555555')
			// Find line 2 runs — after the first breakLine
			const breakIdx = runs.findIndex(r => r.options.breakLine)
			const line2Run = runs[breakIdx + 1]
			assert(line2Run.options.color !== '555555', 'line 2 should keep theme color, not 555555')
			// Line 3 — after second breakLine
			const secondBreak = runs.findIndex((r, i) => i > breakIdx && r.options.breakLine)
			const line3Run = runs[secondBreak + 1]
			assert(line3Run.options.color === '555555', 'line 3 should be dimmed to 555555')
		},
	},
	{
		name: 'tokenizeCode: empty source yields empty array and never throws',
		fn: async () => {
			const { tokenizeCode, codeRuns } = require('../src/bld/utils.cjs.js')
			const result = tokenizeCode('')
			assert(Array.isArray(result), 'expected array')
			assert(result.length === 0, 'expected empty array')
			const runs = codeRuns('')
			assert(Array.isArray(runs), 'expected array from codeRuns')
			assert(runs.length === 0, 'expected empty array from codeRuns')
		},
	},
]
