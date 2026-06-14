'use strict'

// Tests for resolveFontFiles + readFontName (docs/features/feature-font-family-resolver.md).
// All font fixtures are synthetic TTF buffers written into a temp dir at test time — no binary
// blobs committed to the repository.

const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { resolveFontFiles, readFontName } = require('../src/bld/utils.cjs.js')
const { assert } = require('./helpers')

const IMPLEMENTED = typeof resolveFontFiles === 'function' && typeof readFontName === 'function'
function requireImpl() {
	if (!IMPLEMENTED) throw new Error('resolveFontFiles / readFontName not implemented yet')
}

// ── synthetic TTF builder ─────────────────────────────────────────────────────

// Builds a minimal but valid sfnt buffer with a single 'name' table.
// Records are written as Windows platform (3), encoding 1 (Unicode BMP), lang 0x0409.
// opts.typographicFamily / opts.typographicSubfamily add nameID 16 / 17.
function makeFontBuf(family, subfamily, opts = {}) {
	const names = [
		{ nameId: 1, value: opts.legacyFamily ?? family },
		{ nameId: 2, value: opts.legacySubfamily ?? subfamily },
	]
	if (opts.typographicFamily)    names.push({ nameId: 16, value: opts.typographicFamily })
	if (opts.typographicSubfamily) names.push({ nameId: 17, value: opts.typographicSubfamily })

	// Encode each string as UTF-16BE
	const encoded = names.map(({ nameId, value }) => {
		const le = Buffer.from(value, 'utf16le')
		const be = Buffer.alloc(le.length)
		for (let i = 0; i < le.length; i += 2) { be[i] = le[i + 1]; be[i + 1] = le[i] }
		return { nameId, buf: be }
	})

	// Build string storage with running offsets
	let strOff = 0
	const withOffsets = encoded.map(({ nameId, buf }) => {
		const item = { nameId, buf, offset: strOff }
		strOff += buf.length
		return item
	})

	// Name table header (6 bytes)
	const hdr = Buffer.alloc(6)
	hdr.writeUInt16BE(0, 0)                             // format
	hdr.writeUInt16BE(names.length, 2)                  // count
	hdr.writeUInt16BE(6 + names.length * 12, 4)         // stringOffset

	// Name records (12 bytes each)
	const recsBuf = Buffer.alloc(names.length * 12)
	withOffsets.forEach(({ nameId, buf, offset }, i) => {
		const b = i * 12
		recsBuf.writeUInt16BE(3, b)        // platformId: Windows
		recsBuf.writeUInt16BE(1, b + 2)    // encodingId: Unicode BMP
		recsBuf.writeUInt16BE(0x0409, b + 4) // languageId: en-US
		recsBuf.writeUInt16BE(nameId, b + 6)
		recsBuf.writeUInt16BE(buf.length, b + 8)
		recsBuf.writeUInt16BE(offset, b + 10)
	})

	const strStorage = Buffer.concat(withOffsets.map(e => e.buf))
	const nameTable  = Buffer.concat([hdr, recsBuf, strStorage])

	// sfnt offset table (12 bytes) + one table dir entry (16 bytes)
	const sfntHdr = Buffer.alloc(12)
	sfntHdr.writeUInt32BE(0x00010000, 0)  // sfVersion
	sfntHdr.writeUInt16BE(1, 4)           // numTables
	sfntHdr.writeUInt16BE(16, 6)          // searchRange
	sfntHdr.writeUInt16BE(0, 8)           // entrySelector
	sfntHdr.writeUInt16BE(0, 10)          // rangeShift

	const dirEntry = Buffer.alloc(16)
	dirEntry.write('name', 0, 'ascii')
	dirEntry.writeUInt32BE(0, 4)           // checkSum (unused)
	dirEntry.writeUInt32BE(28, 8)          // offset: 12 + 16 = 28
	dirEntry.writeUInt32BE(nameTable.length, 12)

	return Buffer.concat([sfntHdr, dirEntry, nameTable])
}

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTempDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-font-test-'))
}

function writeFontFile(dir, filename, family, subfamily, opts = {}) {
	const p = path.join(dir, filename)
	fs.writeFileSync(p, makeFontBuf(family, subfamily, opts))
	return p
}

function rmTempDir(dir) {
	try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

// ── tests ─────────────────────────────────────────────────────────────────────

module.exports = [

	// ── readFontName unit tests ─────────────────────────────────────────────

	{
		name: 'readFontName: returns family and subfamily from a synthetic TTF',
		fn: () => {
			requireImpl()
			const buf    = makeFontBuf('Inter', 'Regular')
			const result = readFontName(buf)
			assert(result !== null, 'expected non-null result')
			assert(result.family    === 'Inter',   'family mismatch: ' + result.family)
			assert(result.subfamily === 'Regular', 'subfamily mismatch: ' + result.subfamily)
		},
	},

	{
		name: 'readFontName: returns null for WOFF magic',
		fn: () => {
			requireImpl()
			const buf = Buffer.alloc(16)
			buf.writeUInt32BE(0x774F4646, 0)  // 'wOFF'
			assert(readFontName(buf) === null, 'expected null for WOFF')
		},
	},

	{
		name: 'readFontName: returns null for WOFF2 magic',
		fn: () => {
			requireImpl()
			const buf = Buffer.alloc(16)
			buf.writeUInt32BE(0x774F4632, 0)  // 'wOF2'
			assert(readFontName(buf) === null, 'expected null for WOFF2')
		},
	},

	{
		name: 'readFontName: returns null for an empty / garbage buffer',
		fn: () => {
			requireImpl()
			assert(readFontName(Buffer.alloc(0))   === null, 'empty buffer should return null')
			assert(readFontName(Buffer.alloc(4))   === null, 'tiny buffer should return null')
			assert(readFontName(Buffer.from('hello world')) === null, 'garbage should return null')
		},
	},

	{
		name: 'readFontName: prefers nameID 16 (typographic family) over nameID 1',
		fn: () => {
			requireImpl()
			// Legacy family = "Inter Regular" (the old-style split), typographic = "Inter"
			const buf    = makeFontBuf('Inter Regular', 'Regular', { typographicFamily: 'Inter', typographicSubfamily: 'Regular' })
			const result = readFontName(buf)
			assert(result !== null, 'expected result')
			assert(result.family === 'Inter', 'expected typographic family "Inter", got "' + result.family + '"')
		},
	},

	// ── AC1: Inter-Regular.ttf and Inter-VariableFont ──────────────────────

	{
		name: 'AC1a: resolveFontFiles — Inter-Regular.ttf resolves to regular role',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				const p = writeFontFile(dir, 'Inter-Regular.ttf', 'Inter', 'Regular')
				const m = resolveFontFiles(dir, ['Inter'])
				assert(m instanceof Map, 'expected Map')
				assert(m.has('Inter'), 'expected "Inter" key in map')
				const entry = m.get('Inter')
				assert(entry && entry.regular === p, 'expected regular path = ' + p + ', got ' + (entry && entry.regular))
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'AC1b: resolveFontFiles — Inter-Bold.ttf resolves to bold role',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				writeFontFile(dir, 'Inter-Regular.ttf', 'Inter', 'Regular')
				const boldPath = writeFontFile(dir, 'Inter-Bold.ttf', 'Inter', 'Bold')
				const m = resolveFontFiles(dir, ['Inter'])
				const entry = m.get('Inter')
				assert(entry && entry.bold === boldPath, 'expected bold path = ' + boldPath + ', got ' + (entry && entry.bold))
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'AC1c: resolveFontFiles — Inter-VariableFont resolves when it carries family="Inter"',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				// Variable fonts typically have family name "Inter" and subfamily "Regular"
				const p = writeFontFile(dir, 'Inter-VariableFont_slnt,wght.ttf', 'Inter', 'Regular')
				const m = resolveFontFiles(dir, ['Inter'])
				assert(m.has('Inter'), 'expected "Inter" key')
				const entry = m.get('Inter')
				assert(entry && entry.regular === p, 'expected regular = ' + p)
			} finally {
				rmTempDir(dir)
			}
		},
	},

	// ── AC2: Font Awesome — resolved by internal name (non-standard subfamily) ──

	{
		name: 'AC2: resolveFontFiles — fa-solid-900.ttf resolved by internal name (subfamily "Solid")',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				const faPath = writeFontFile(dir, 'fa-solid-900.ttf', 'Font Awesome 6 Free', 'Solid')
				const m = resolveFontFiles(dir, ['Font Awesome 6 Free'])
				assert(m instanceof Map, 'expected Map')
				assert(m.has('Font Awesome 6 Free'), 'expected "Font Awesome 6 Free" key in map')
				// "Solid" is not a standard role; as the only file it falls back to regular
				const entry = m.get('Font Awesome 6 Free')
				const allPaths = [entry.regular, entry.bold, entry.italic, entry.boldItalic].filter(Boolean)
				assert(allPaths.includes(faPath), 'expected fa-solid-900.ttf path in result; entry=' + JSON.stringify(entry))
			} finally {
				rmTempDir(dir)
			}
		},
	},

	// ── AC3: exact-family discipline — "Inter" must not match "Inter Tight" ──

	{
		name: 'AC3: resolveFontFiles — "Inter" does not match "Inter Tight"',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				writeFontFile(dir, 'Inter-Regular.ttf',      'Inter',       'Regular')
				writeFontFile(dir, 'InterTight-Regular.ttf', 'Inter Tight', 'Regular')
				const m = resolveFontFiles(dir, ['Inter'])
				assert(m.has('Inter'), 'expected "Inter" key')
				assert(!m.has('Inter Tight'), '"Inter Tight" must not appear when not requested')
				const entry = m.get('Inter')
				assert(
					entry && entry.regular && entry.regular.endsWith('Inter-Regular.ttf'),
					'"Inter" regular must point to Inter-Regular.ttf, not Inter Tight; got ' + (entry && entry.regular),
				)
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'AC3b: resolveFontFiles — requesting both "Inter" and "Inter Tight" resolves each independently',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				const interPath  = writeFontFile(dir, 'Inter-Regular.ttf',      'Inter',       'Regular')
				const tightPath  = writeFontFile(dir, 'InterTight-Regular.ttf', 'Inter Tight', 'Regular')
				const m = resolveFontFiles(dir, ['Inter', 'Inter Tight'])
				assert(m.has('Inter'),       'missing "Inter"')
				assert(m.has('Inter Tight'), 'missing "Inter Tight"')
				assert(m.get('Inter').regular === interPath,  '"Inter" regular mismatch')
				assert(m.get('Inter Tight').regular === tightPath, '"Inter Tight" regular mismatch')
			} finally {
				rmTempDir(dir)
			}
		},
	},

	// ── AC4: API parity — export exists at the public entry ──────────────────

	{
		name: 'AC4: resolveFontFiles and readFontName are exported from the utils entry',
		fn: () => {
			assert(typeof resolveFontFiles === 'function', 'resolveFontFiles must be a function')
			assert(typeof readFontName     === 'function', 'readFontName must be a function')
		},
	},

	// ── edge cases ───────────────────────────────────────────────────────────

	{
		name: 'resolveFontFiles: returns empty Map for non-existent directory',
		fn: () => {
			requireImpl()
			const m = resolveFontFiles('/tmp/__nonexistent_dir_pptxgenjs__', ['Inter'])
			assert(m instanceof Map && m.size === 0, 'expected empty Map for missing dir')
		},
	},

	{
		name: 'resolveFontFiles: accepts explicit file list instead of a directory',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				const p = writeFontFile(dir, 'Inter-Regular.ttf', 'Inter', 'Regular')
				const m = resolveFontFiles([p], ['Inter'])
				assert(m.has('Inter'), 'expected "Inter" key from explicit file list')
				assert(m.get('Inter').regular === p, 'expected regular = ' + p)
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'resolveFontFiles: case-insensitive family matching',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				writeFontFile(dir, 'Inter-Regular.ttf', 'Inter', 'Regular')
				// caller requests lowercase 'inter'; should still match
				const m = resolveFontFiles(dir, ['inter'])
				assert(m.has('inter'), 'expected "inter" key (lowercase requested)')
				assert(m.get('inter').regular, 'expected regular to be set')
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'resolveFontFiles: italic and boldItalic roles are resolved correctly',
		fn: () => {
			requireImpl()
			const dir = makeTempDir()
			try {
				const italicPath     = writeFontFile(dir, 'Inter-Italic.ttf',     'Inter', 'Italic')
				const boldItalicPath = writeFontFile(dir, 'Inter-BoldItalic.ttf', 'Inter', 'Bold Italic')
				const m = resolveFontFiles(dir, ['Inter'])
				const entry = m.get('Inter')
				assert(entry && entry.italic     === italicPath,     'italic mismatch')
				assert(entry && entry.boldItalic === boldItalicPath, 'boldItalic mismatch')
			} finally {
				rmTempDir(dir)
			}
		},
	},

]
