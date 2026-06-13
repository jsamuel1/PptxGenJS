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
	{
		name: 'tokenizeCode: Python lang detects def/lambda as keywords, not JS-only keywords',
		fn: async () => {
			const { tokenizeCode } = require('../src/bld/utils.cjs.js')
			const tokens = tokenizeCode('def greet(name):\n  return f"hello {name}"', 'python')
			const defTk = tokens.find(t => t.text === 'def')
			assert(defTk && defTk.token === 'keyword', 'expected "def" as keyword in Python')
			const returnTk = tokens.find(t => t.text === 'return')
			assert(returnTk && returnTk.token === 'keyword', 'expected "return" as keyword in Python')
			// "greet" should be function (followed by "(")
			const greetTk = tokens.find(t => t.text === 'greet')
			assert(greetTk && greetTk.token === 'function', 'expected "greet" as function in Python')
			// "const" is NOT a Python keyword — should be plain
			const constTokens = tokenizeCode('const x = 1', 'python')
			const constTk = constTokens.find(t => t.text === 'const')
			assert(constTk && constTk.token === 'plain', 'expected "const" as plain in Python (not a Python keyword)')
		},
	},
	{
		name: 'tokenizeCode: Rust lang detects fn/mut/impl as keywords',
		fn: async () => {
			const { tokenizeCode } = require('../src/bld/utils.cjs.js')
			const tokens = tokenizeCode('fn main() {\n  let mut x = 5;\n}', 'rust')
			const fnTk = tokens.find(t => t.text === 'fn')
			assert(fnTk && fnTk.token === 'keyword', 'expected "fn" as keyword in Rust')
			const letTk = tokens.find(t => t.text === 'let')
			assert(letTk && letTk.token === 'keyword', 'expected "let" as keyword in Rust')
			const mutTk = tokens.find(t => t.text === 'mut')
			assert(mutTk && mutTk.token === 'keyword', 'expected "mut" as keyword in Rust')
			// "main" should be function (followed by "(")
			const mainTk = tokens.find(t => t.text === 'main')
			assert(mainTk && mainTk.token === 'function', 'expected "main" as function in Rust')
		},
	},
	{
		name: 'tokenizeCode: unknown lang falls back to JS keywords',
		fn: async () => {
			const { tokenizeCode } = require('../src/bld/utils.cjs.js')
			const tokens = tokenizeCode('const x = 1', 'unknown-lang-xyz')
			const constTk = tokens.find(t => t.text === 'const')
			assert(constTk && constTk.token === 'keyword', 'expected "const" as keyword with unknown lang (JS fallback)')
		},
	},
]
