'use strict'

// Tests for resolver provenance (docs/features/feature-resolver-provenance.md).
// Covers:
//   AC1: resolveFontFiles matchedBy field — 'name-table' for found, 'none' for missing
//   AC2: extractThemeFromCSS slotSource — 'extracted' vs 'preset' per slot
//   AC3: slotSource 'derived' for computed slots (cardLine/cardFill/barStops)

const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { resolveFontFiles, extractThemeFromCSS } = require('../src/bld/utils.cjs.js')
const { assert } = require('./helpers')

const HAVE_RESOLVE = typeof resolveFontFiles === 'function'
const HAVE_EXTRACT = typeof extractThemeFromCSS === 'function'

// ── synthetic TTF builder (copied from feature-font-family-resolver.test.js) ─

function makeFontBuf(family, subfamily) {
	const names = [
		{ nameId: 1, value: family },
		{ nameId: 2, value: subfamily },
	]
	// Each record: 12 bytes; string data in UTF-16BE
	const toUtf16BE = s => {
		const buf = Buffer.alloc(s.length * 2)
		for (let i = 0; i < s.length; i++) buf.writeUInt16BE(s.charCodeAt(i), i * 2)
		return buf
	}
	const stringData  = names.map(n => toUtf16BE(n.value))
	const totalString = stringData.reduce((a, b) => a + b.length, 0)
	const count       = names.length
	const nameTableSize = 6 + count * 12 + totalString
	const nameBuf   = Buffer.alloc(nameTableSize, 0)
	nameBuf.writeUInt16BE(0, 0)          // format
	nameBuf.writeUInt16BE(count, 2)      // count
	nameBuf.writeUInt16BE(6 + count * 12, 4) // stringOffset

	let strOff = 0
	names.forEach((n, i) => {
		const sd  = stringData[i]
		const rec = 6 + i * 12
		nameBuf.writeUInt16BE(3, rec)           // platformId = 3 (Windows)
		nameBuf.writeUInt16BE(1, rec + 2)       // encodingId = 1 (Unicode BMP)
		nameBuf.writeUInt16BE(0x0409, rec + 4)  // languageId = English
		nameBuf.writeUInt16BE(n.nameId, rec + 6)
		nameBuf.writeUInt16BE(sd.length, rec + 8)
		nameBuf.writeUInt16BE(strOff, rec + 10)
		sd.copy(nameBuf, 6 + count * 12 + strOff)
		strOff += sd.length
	})

	// Minimal sfnt: sfVersion(4) + numTables=1 + searchRange + entrySelector + rangeShift
	const sfntHeader = Buffer.alloc(12, 0)
	sfntHeader.writeUInt32BE(0x00010000, 0) // sfVersion = 1.0
	sfntHeader.writeUInt16BE(1, 4)          // numTables = 1

	// Table directory entry for 'name' (16 bytes)
	const tableDir = Buffer.alloc(16, 0)
	tableDir.write('name', 0, 4, 'ascii')
	tableDir.writeUInt32BE(0, 4)                         // checksum
	tableDir.writeUInt32BE(12 + 16, 8)                   // offset (after sfntHeader + tableDir)
	tableDir.writeUInt32BE(nameTableSize, 12)             // length

	return Buffer.concat([sfntHeader, tableDir, nameBuf])
}

function makeTempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-prov-')) }
function writeFontFile(dir, filename, family, subfamily) {
	const p = path.join(dir, filename)
	fs.writeFileSync(p, makeFontBuf(family, subfamily))
	return p
}
function rmTempDir(dir) {
	try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

// ── tests ─────────────────────────────────────────────────────────────────────

module.exports = [

	// ── AC1: resolveFontFiles matchedBy ────────────────────────────────────────

	{
		name: 'AC1a: resolveFontFiles — found family has matchedBy=name-table',
		fn: () => {
			if (!HAVE_RESOLVE) throw new Error('resolveFontFiles not implemented')
			const dir = makeTempDir()
			try {
				writeFontFile(dir, 'Inter-Regular.ttf', 'Inter', 'Regular')
				const m = resolveFontFiles(dir, ['Inter'])
				assert(m.has('Inter'), 'expected Inter in result')
				assert(m.get('Inter').matchedBy === 'name-table',
					'expected matchedBy=name-table, got ' + m.get('Inter').matchedBy)
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'AC1b: resolveFontFiles — missing family has matchedBy=none',
		fn: () => {
			if (!HAVE_RESOLVE) throw new Error('resolveFontFiles not implemented')
			const dir = makeTempDir()
			try {
				writeFontFile(dir, 'Inter-Regular.ttf', 'Inter', 'Regular')
				// Request 'Roboto' which is not in the dir
				const m = resolveFontFiles(dir, ['Inter', 'Roboto'])
				assert(m.has('Roboto'), 'expected Roboto in result (all families present)')
				assert(m.get('Roboto').matchedBy === 'none',
					'expected matchedBy=none for Roboto, got ' + m.get('Roboto').matchedBy)
				// Found family is unaffected
				assert(m.get('Inter').matchedBy === 'name-table', 'Inter should be name-table')
			} finally {
				rmTempDir(dir)
			}
		},
	},

	{
		name: 'AC1c: resolveFontFiles — matchedBy=none for empty directory',
		fn: () => {
			if (!HAVE_RESOLVE) throw new Error('resolveFontFiles not implemented')
			const dir = makeTempDir()
			try {
				const m = resolveFontFiles(dir, ['Inter'])
				assert(m.has('Inter'), 'expected Inter in result')
				assert(m.get('Inter').matchedBy === 'none', 'expected matchedBy=none for empty dir')
				assert(!m.get('Inter').regular, 'no role paths for missing family')
			} finally {
				rmTempDir(dir)
			}
		},
	},

	// ── AC2: extractThemeFromCSS slotSource ────────────────────────────────────

	{
		name: 'AC2: extractThemeFromCSS — slotSource.bg=extracted, slotSource.accent=preset',
		fn: () => {
			if (!HAVE_EXTRACT) throw new Error('extractThemeFromCSS not implemented')
			// Only --bg and --text provided; accent comes from preset
			const theme = extractThemeFromCSS(':root { --bg: #1a1a2e; --text: #e8e8f0; }')
			assert(theme.slotSource, 'expected slotSource to be present')
			assert(theme.slotSource['bg'] === 'extracted',
				'bg should be extracted, got: ' + theme.slotSource['bg'])
			assert(theme.slotSource['text'] === 'extracted',
				'text should be extracted, got: ' + theme.slotSource['text'])
			assert(theme.slotSource['accent'] === 'preset',
				'accent should be preset, got: ' + theme.slotSource['accent'])
		},
	},

	{
		name: 'AC2b: extractThemeFromCSS — forcePreset gives all palette slots as preset',
		fn: () => {
			if (!HAVE_EXTRACT) throw new Error('extractThemeFromCSS not implemented')
			const theme = extractThemeFromCSS('', { forcePreset: 'dark' })
			assert(theme.slotSource, 'expected slotSource')
			assert(theme.slotSource['bg'] === 'preset',
				'bg should be preset under forcePreset, got: ' + theme.slotSource['bg'])
			assert(theme.slotSource['accent'] === 'preset',
				'accent should be preset under forcePreset, got: ' + theme.slotSource['accent'])
		},
	},

	// ── AC3: derived slots ────────────────────────────────────────────────────

	{
		name: 'AC3: extractThemeFromCSS — slotSource.cardLine=derived when derivedColors enabled',
		fn: () => {
			if (!HAVE_EXTRACT) throw new Error('extractThemeFromCSS not implemented')
			const theme = extractThemeFromCSS(':root { --bg: #1a1a2e; --accent: #7c3aed; }', { derivedColors: true })
			assert(theme.slotSource, 'expected slotSource')
			assert(theme.slotSource['cardLine'] === 'derived',
				'cardLine should be derived, got: ' + theme.slotSource['cardLine'])
			assert(theme.slotSource['cardFill'] === 'derived',
				'cardFill should be derived, got: ' + theme.slotSource['cardFill'])
			assert(theme.slotSource['barStops'] === 'derived',
				'barStops should be derived, got: ' + theme.slotSource['barStops'])
		},
	},

	{
		name: 'AC3b: extractThemeFromCSS — derived slots absent when derivedColors=false',
		fn: () => {
			if (!HAVE_EXTRACT) throw new Error('extractThemeFromCSS not implemented')
			const theme = extractThemeFromCSS(':root { --bg: #1a1a2e; }', { derivedColors: false })
			// cardLine/cardFill/barStops are not set at all, so they should be preset or absent
			assert(theme.slotSource, 'expected slotSource')
			assert(theme.slotSource['cardLine'] !== 'derived',
				'cardLine should not be derived when derivedColors=false')
		},
	},

]
