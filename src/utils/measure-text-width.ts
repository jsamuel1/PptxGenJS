/**
 * PptxGenJS — script-aware text width estimator (docs/features/feature-text-measurement-from-font.md).
 *
 * `measureTextWidth(text, opts)` estimates the advance width of `text` rendered at `opts.fontSize`
 * points, returning the result in **inches**.
 *
 * Two paths:
 *  a. `opts.fontFile` — parse `head`+`hhea`+`hmtx`+`cmap` (format 4 — BMP) from an sfnt/TTC
 *     buffer. Maps each codepoint → glyph via cmap, sums advances from hmtx, scales by
 *     `fontSize / unitsPerEm / 72` → inches.
 *  b. Fallback (no font file or unsupported format) — classify each codepoint by Unicode block
 *     (CJK/fullwidth ≈ 1.0 em, Latin/ASCII ≈ 0.5 em) and compute `emFactor × fontSize / 72`
 *     per codepoint → inches. Already far better than a single Latin constant.
 */
import * as fs from 'fs'

/** Options for {@link measureTextWidth}. */
export interface MeasureTextWidthOptions {
	/** Font size in points (required). */
	fontSize: number
	/** Path to a TTF, OTF, or TTC font file. When supplied, uses per-glyph advance widths from hmtx. */
	fontFile?: string
	/**
	 * Override the per-character em factor used by the Unicode-block fallback. When omitted, each
	 * codepoint is classified individually (CJK ≈ 1.0, Latin ≈ 0.5). When supplied, every
	 * codepoint uses this factor — useful for bulk/consistent estimates.
	 */
	fallbackEmFactor?: number
}

// ── Unicode-block fallback ─────────────────────────────────────────────────────

/** Em-factor for a single codepoint. Wide/CJK scripts ≈ 1.0, Latin/ASCII ≈ 0.5. */
function emFactorOf(cp: number): number {
	if (cp >= 0x4E00 && cp <= 0x9FFF)   return 1.0  // CJK Unified Ideographs
	if (cp >= 0x3400 && cp <= 0x4DBF)   return 1.0  // CJK Extension A
	if (cp >= 0x20000 && cp <= 0x323AF) return 1.0  // CJK Extensions B–H
	if (cp >= 0xF900 && cp <= 0xFAFF)   return 1.0  // CJK Compatibility Ideographs
	if (cp >= 0xAC00 && cp <= 0xD7A3)   return 1.0  // Hangul Syllables
	if (cp >= 0x1100 && cp <= 0x11FF)   return 1.0  // Hangul Jamo
	if (cp >= 0x3130 && cp <= 0x318F)   return 1.0  // Hangul Compatibility Jamo
	if (cp >= 0x3040 && cp <= 0x30FF)   return 1.0  // Hiragana + Katakana
	if (cp >= 0xFF01 && cp <= 0xFF60)   return 1.0  // Fullwidth forms
	if (cp >= 0xFFE0 && cp <= 0xFFE6)   return 1.0  // Fullwidth signs
	if (cp >= 0x3000 && cp <= 0x303F)   return 1.0  // CJK Symbols and Punctuation
	return 0.5
}

function measureByUnicodeBlock(text: string, fontSize: number, fallbackEmFactor?: number): number {
	let totalEm = 0
	for (const char of text) {
		const cp = char.codePointAt(0) ?? 0x20
		totalEm += fallbackEmFactor !== undefined ? fallbackEmFactor : emFactorOf(cp)
	}
	return totalEm * fontSize / 72
}

// ── sfnt / TTC font file parsing ──────────────────────────────────────────────

const MAGIC_TTC   = 0x74746366  // 'ttcf'
const MAGIC_WOFF  = 0x774F4646  // 'wOFF'
const MAGIC_WOFF2 = 0x774F4632  // 'wOF2'

function measureByFont(text: string, fontSize: number, fontFile: string): number | null {
	let buf: Buffer
	try { buf = fs.readFileSync(fontFile) } catch { return null }
	if (buf.length < 4) return null

	const magic = buf.readUInt32BE(0)
	if (magic === MAGIC_WOFF || magic === MAGIC_WOFF2) return null  // unsupported — not an error

	const sfntOffset = magic === MAGIC_TTC
		? (buf.length >= 12 ? buf.readUInt32BE(8) : -1)
		: 0
	if (sfntOffset < 0) return null

	const tables = readTableDirectory(buf, sfntOffset)
	if (!tables) return null

	const unitsPerEm = readUnitsPerEm(buf, tables)
	if (!unitsPerEm || unitsPerEm === 0) return null

	const numberOfHMetrics = readNumberOfHMetrics(buf, tables)
	if (!numberOfHMetrics || numberOfHMetrics === 0) return null

	const hmtxOffset = tables.get('hmtx')
	if (hmtxOffset === undefined) return null

	const glyphIdFor = buildCmapLookup(buf, tables)
	if (!glyphIdFor) return null

	let totalAdvance = 0
	for (const char of text) {
		const cp = char.codePointAt(0) ?? 0
		const glyphId = glyphIdFor(cp)
		totalAdvance += readAdvanceWidth(buf, hmtxOffset, numberOfHMetrics, glyphId)
	}

	return totalAdvance * fontSize / unitsPerEm / 72
}

function readTableDirectory(buf: Buffer, sfntOffset: number): Map<string, number> | null {
	if (sfntOffset + 12 > buf.length) return null
	const numTables = buf.readUInt16BE(sfntOffset + 4)
	if (numTables === 0 || numTables > 256) return null
	if (sfntOffset + 12 + numTables * 16 > buf.length) return null

	const tables = new Map<string, number>()
	for (let i = 0; i < numTables; i++) {
		const dir = sfntOffset + 12 + i * 16
		tables.set(buf.toString('ascii', dir, dir + 4), buf.readUInt32BE(dir + 8))
	}
	return tables
}

function readUnitsPerEm(buf: Buffer, tables: Map<string, number>): number | null {
	const off = tables.get('head')
	if (off === undefined) return null
	// 'head': unitsPerEm at byte 18 (after version 4 + fontRevision 4 + checkSumAdjustment 4 + magicNumber 4 + flags 2)
	if (off + 20 > buf.length) return null
	return buf.readUInt16BE(off + 18)
}

function readNumberOfHMetrics(buf: Buffer, tables: Map<string, number>): number | null {
	const off = tables.get('hhea')
	if (off === undefined) return null
	// 'hhea': numberOfHMetrics at byte 34
	if (off + 36 > buf.length) return null
	return buf.readUInt16BE(off + 34)
}

function readAdvanceWidth(buf: Buffer, hmtxOffset: number, numberOfHMetrics: number, glyphId: number): number {
	// Glyphs ≥ numberOfHMetrics share the last recorded advance width.
	const idx = glyphId < numberOfHMetrics ? glyphId : numberOfHMetrics - 1
	const off = hmtxOffset + idx * 4
	if (off + 2 > buf.length) return 0
	return buf.readUInt16BE(off)
}

/** Build a codepoint → glyph-id resolver from the cmap format-4 (BMP) subtable. */
function buildCmapLookup(buf: Buffer, tables: Map<string, number>): ((cp: number) => number) | null {
	const cmapOff = tables.get('cmap')
	if (cmapOff === undefined) return null
	if (cmapOff + 4 > buf.length) return null

	const numSubtables = buf.readUInt16BE(cmapOff + 2)
	let fmt4Off = -1

	for (let i = 0; i < numSubtables; i++) {
		const rec = cmapOff + 4 + i * 8
		if (rec + 8 > buf.length) break
		const platformId = buf.readUInt16BE(rec)
		const encodingId = buf.readUInt16BE(rec + 2)
		const subtableOff = cmapOff + buf.readUInt32BE(rec + 4)
		if (subtableOff + 2 > buf.length) continue
		if (buf.readUInt16BE(subtableOff) !== 4) continue  // only format 4

		// Prefer Windows/BMP (platform 3, encoding 1) — stop on first match.
		if (platformId === 3 && encodingId === 1) { fmt4Off = subtableOff; break }
		// Accept Unicode (platform 0) as fallback.
		if (platformId === 0) fmt4Off = subtableOff
	}
	if (fmt4Off < 0) return null

	// Format-4 header: format(2) length(2) language(2) segCountX2(2) searchRange(2) entrySelector(2) rangeShift(2)
	if (fmt4Off + 14 > buf.length) return null
	const segCount = buf.readUInt16BE(fmt4Off + 6) / 2
	if (segCount === 0) return null

	const endCodesOff   = fmt4Off + 14
	const startCodesOff = endCodesOff + segCount * 2 + 2   // +2 for reservedPad
	const idDeltaOff    = startCodesOff + segCount * 2
	const idRangeOffOff = idDeltaOff + segCount * 2

	if (idRangeOffOff + segCount * 2 > buf.length) return null

	return (cp: number): number => {
		// Binary search on endCodes (sorted ascending).
		let lo = 0; const hi = segCount - 1
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1
			const endCode = buf.readUInt16BE(endCodesOff + mid * 2)
			if (cp > endCode) { lo = mid + 1; continue }
			const startCode = buf.readUInt16BE(startCodesOff + mid * 2)
			if (cp < startCode) return 0

			const idRangeOffset = buf.readUInt16BE(idRangeOffOff + mid * 2)
			if (idRangeOffset === 0) {
				// Contiguous block: apply delta directly.
				const delta = buf.readInt16BE(idDeltaOff + mid * 2)
				return (cp + delta) & 0xFFFF
			}
			// Indirect: byte offset from the idRangeOffset field's position in the table.
			const glyphOff = (idRangeOffOff + mid * 2) + idRangeOffset + (cp - startCode) * 2
			if (glyphOff + 2 > buf.length) return 0
			const rawGlyph = buf.readUInt16BE(glyphOff)
			if (rawGlyph === 0) return 0
			const delta = buf.readInt16BE(idDeltaOff + mid * 2)
			return (rawGlyph + delta) & 0xFFFF
		}
		return 0
	}
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Estimate the advance width of `text` rendered at `opts.fontSize` points, in **inches**.
 *
 * When `opts.fontFile` is given, parses the sfnt `head`/`hhea`/`hmtx`/`cmap` tables for
 * per-glyph metrics (TTF, OTF, TTC). Falls back to per-codepoint Unicode-block em factors
 * (CJK ≈ 1.0 em, Latin ≈ 0.5 em) when the file cannot be read, is a WOFF/WOFF2, or has no
 * format-4 cmap subtable.
 *
 * Returns `0` for an empty string regardless of options.
 */
export function measureTextWidth(text: string, opts: MeasureTextWidthOptions): number {
	if (!text) return 0
	const fontSize = opts.fontSize > 0 ? opts.fontSize : 12

	if (opts.fontFile) {
		const result = measureByFont(text, fontSize, opts.fontFile)
		if (result !== null) return result
	}

	return measureByUnicodeBlock(text, fontSize, opts.fallbackEmFactor)
}
