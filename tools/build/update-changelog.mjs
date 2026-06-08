#!/usr/bin/env node
/**
 * Roll the CHANGELOG "[Unreleased]" section into a dated, versioned release
 * section, leaving a fresh, empty "[Unreleased]" marker in place.
 *
 * Invoked by the release automation (.github/workflows/version-bump.yml) right
 * after the version is bumped, so the version that ships also carries its
 * changelog entry. Designed to be safe to run by hand too.
 *
 * Usage:
 *   node tools/build/update-changelog.mjs <version> [--date YYYY-MM-DD] [--file CHANGELOG.md] [--repo owner/name]
 *
 * Behaviour:
 *   - Finds the "## [Unreleased]" heading and the next "## [" heading.
 *   - Moves everything between them into a new
 *       "## [<version>](https://github.com/<repo>/releases/tag/v<version>) - <date>"
 *     section, inserted directly below "[Unreleased]".
 *   - Leaves "## [Unreleased]" with no entries (Keep a Changelog style).
 *   - No-op (exit 0) if [Unreleased] has no entries, or if a section for
 *     <version> already exists — this keeps the workflow idempotent on re-runs.
 */

import fs from 'node:fs'
import path from 'node:path'

function parseArgs(argv) {
	const args = { _: [] }
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]
		if (a === '--date') args.date = argv[++i]
		else if (a === '--file') args.file = argv[++i]
		else if (a === '--repo') args.repo = argv[++i]
		else args._.push(a)
	}
	return args
}

function deriveRepoFromPackageJson() {
	try {
		const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
		const url = pkg?.repository?.url || pkg?.repository || ''
		// e.g. "git+https://github.com/jsamuel1/PptxGenJS.git" -> "jsamuel1/PptxGenJS"
		const m = String(url).match(/github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?(?:#.*)?$/)
		if (m) return m[1]
	} catch {
		/* fall through */
	}
	return null
}

function main() {
	const args = parseArgs(process.argv.slice(2))

	const rawVersion = args._[0]
	if (!rawVersion) {
		console.error('Usage: update-changelog.mjs <version> [--date YYYY-MM-DD] [--file CHANGELOG.md] [--repo owner/name]')
		process.exit(1)
	}
	// Accept "v4.2.0" or "4.2.0"; normalise to a bare number for the heading.
	const version = rawVersion.replace(/^v/, '')

	const file = args.file || 'CHANGELOG.md'
	const date = args.date || new Date().toISOString().slice(0, 10)
	const repo = args.repo || deriveRepoFromPackageJson()
	if (!repo) {
		console.error('Could not determine repository (owner/name). Pass --repo explicitly.')
		process.exit(1)
	}

	const filePath = path.resolve(file)
	const original = fs.readFileSync(filePath, 'utf8')
	const eol = original.includes('\r\n') ? '\r\n' : '\n'
	const lines = original.split(/\r?\n/)

	const unreleasedIdx = lines.findIndex(l => /^##\s*\[Unreleased\]/i.test(l))
	if (unreleasedIdx === -1) {
		console.error(`No "## [Unreleased]" heading found in ${file}; nothing to do.`)
		process.exit(1)
	}

	// Find the next "## [" heading after [Unreleased] — that bounds the section.
	let nextHeadingIdx = lines.length
	for (let i = unreleasedIdx + 1; i < lines.length; i++) {
		if (/^##\s*\[/.test(lines[i])) {
			nextHeadingIdx = i
			break
		}
	}

	// Already released this version? Idempotent no-op.
	const versionHeadingRe = new RegExp(`^##\\s*\\[v?${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]`)
	if (lines.some(l => versionHeadingRe.test(l))) {
		console.log(`CHANGELOG already has a section for ${version}; leaving it unchanged.`)
		return
	}

	// The body of [Unreleased] is everything between its heading and the next.
	const body = lines.slice(unreleasedIdx + 1, nextHeadingIdx)
	const hasEntries = body.some(l => l.trim().length > 0)
	if (!hasEntries) {
		console.log('[Unreleased] has no entries; nothing to roll into a release.')
		return
	}

	// Trim leading/trailing blank lines from the captured body.
	let start = 0
	let end = body.length
	while (start < end && body[start].trim() === '') start++
	while (end > start && body[end - 1].trim() === '') end--
	const sectionBody = body.slice(start, end)

	const releaseUrl = `https://github.com/${repo}/releases/tag/v${version}`
	const newSection = [
		`## [${version}](${releaseUrl}) - ${date}`,
		'',
		...sectionBody,
	]

	const rebuilt = [
		...lines.slice(0, unreleasedIdx + 1), // up to and including "## [Unreleased]"
		'',
		...newSection,
		'',
		...lines.slice(nextHeadingIdx), // the previous-latest release onward
	]

	// Collapse any run of 3+ blank lines down to a single blank line.
	const out = rebuilt
		.join(eol)
		.replace(new RegExp(`(?:${eol}){3,}`, 'g'), `${eol}${eol}`)

	fs.writeFileSync(filePath, out)
	console.log(`Rolled [Unreleased] into "## [${version}] - ${date}" in ${file}.`)
}

main()
