'use strict'

const fs = require('fs')
const path = require('path')

const failures = []
const successes = []

// Every test file must `module.exports` an array of { name: string, fn: function }.
// Anything else (e.g. a node:test-style describe/it file) is recorded as a failure
// rather than crashing the runner mid-suite and silently skipping later files.
function validCases(cases) {
	return Array.isArray(cases) && cases.every(c => c && typeof c.name === 'string' && typeof c.fn === 'function')
}

async function loadAndRun() {
	const dir = __dirname
	const files = fs.readdirSync(dir).filter(f => /^(bug-\d+|feature-[a-z0-9-]+)\.test\.js$/.test(f)).sort()
	for (const f of files) {
		const full = path.join(dir, f)
		let cases
		try {
			cases = require(full)
		} catch (e) {
			failures.push({ name: f, error: e })
			console.log('  FAIL ' + f + ': threw while loading: ' + e.message)
			continue
		}
		if (!validCases(cases)) {
			const err = new Error(f + ' must `module.exports` an array of { name, fn } cases (got ' + (Array.isArray(cases) ? 'array with invalid entries' : typeof cases) + ')')
			failures.push({ name: f, error: err })
			console.log('  FAIL ' + err.message)
			continue
		}
		for (const c of cases) {
			try {
				await c.fn()
				successes.push(c.name)
				console.log('  ok ' + c.name)
			} catch (e) {
				failures.push({ name: c.name, error: e })
				console.log('  FAIL ' + c.name + ': ' + e.message)
			}
		}
	}
}

;(async () => {
	console.log('Running PptxGenJS regression tests')
	await loadAndRun()
	console.log('\nPassed: ' + successes.length + '  Failed: ' + failures.length)
	if (failures.length > 0) {
		failures.forEach(f => console.log(f.name + ' -- ' + (f.error.stack || f.error.message)))
		process.exit(1)
	}
	process.exit(0)
})().catch(e => {
	console.error('Test runner crashed: ' + (e.stack || e))
	process.exit(1)
})
