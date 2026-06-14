/**
 * PptxGenJS — font family resolver (docs/features/feature-font-family-resolver.md).
 *
 * `resolveFontFiles(source, families, opts)` scans a directory (or explicit file list) for font
 * files and maps each wanted family name to its detected role paths (regular/bold/italic/boldItalic)
 * by reading the font's OpenType `name` table — never by guessing filenames.
 *
 * `readFontName(buf)` is the low-level primitive: parse nameID 16 (typographic family) ?? nameID 1
 * and nameID 17 ?? nameID 2 from an sfnt/TTC buffer. Returns `null` for WOFF/WOFF2 (unsupported;
 * not an error).
 */
import * as fs from 'fs'
import * as path from 'path'

/**
 * File paths for each role of a matched font family.
 *
 * `matchedBy` is the resolver provenance tag:
 * - `'name-table'` — family was found in the scanned files via the OpenType name table.
 * - `'none'`       — family was requested but no matching file was found.
 *
 * Every family passed to {@link resolveFontFiles} appears in the returned Map; check
 * `matchedBy` to distinguish resolved from missing without a separate `has()` call.
 */
export interface FontFiles {
	regular?: string
	bold?: string
	italic?: string
	boldItalic?: string
	/** Resolver provenance: how (or whether) this family was matched. */
	matchedBy: 'name-table' | 'none'
}

/** Options for {@link resolveFontFiles}. */
export interface ResolveFontFilesOptions {
	/** File extensions to scan. @default ['.ttf','.otf','.ttc','.woff','.woff2'] */
	exts?: string[]
}

const DEFAULT_EXTS = ['.ttf', '.otf', '.ttc', '.woff', '.woff2']

// ── sfnt / TTC / WOFF magic bytes ────────────────────────────────────────────

const MAGIC_TTC   = 0x74746366 // 'ttcf'
const MAGIC_WOFF  = 0x774F4646 // 'wOFF'
const MAGIC_WOFF2 = 0x774F4632 // 'wOF2'

/** Parse the family and subfamily name from a font buffer (TTF, OTF, TTC). */
export function readFontName(buf: Buffer): { family: string; subfamily: string } | null {
	if (buf.length < 4) return null
	const magic = buf.readUInt32BE(0)
	if (magic === MAGIC_WOFF || magic === MAGIC_WOFF2) return null   // unsupported — not an error
	if (magic === MAGIC_TTC) {
		if (buf.length < 12) return null
		const firstOffset = buf.readUInt32BE(8)
		return parseSfntName(buf, firstOffset)
	}
	return parseSfntName(buf, 0)
}

function parseSfntName(buf: Buffer, sfntOffset: number): { family: string; subfamily: string } | null {
	if (sfntOffset + 12 > buf.length) return null
	const numTables = buf.readUInt16BE(sfntOffset + 4)
	if (numTables === 0 || numTables > 256) return null
	if (sfntOffset + 12 + numTables * 16 > buf.length) return null

	// Walk the table directory to find 'name'.
	let nameTableOffset = -1
	let nameTableLength = -1
	for (let i = 0; i < numTables; i++) {
		const dirEntry = sfntOffset + 12 + i * 16
		const tag = buf.toString('ascii', dirEntry, dirEntry + 4)
		if (tag === 'name') {
			nameTableOffset = buf.readUInt32BE(dirEntry + 8)
			nameTableLength = buf.readUInt32BE(dirEntry + 12)
			break
		}
	}
	if (nameTableOffset < 0 || nameTableOffset + nameTableLength > buf.length) return null

	return parseNameTable(buf, nameTableOffset)
}

function parseNameTable(buf: Buffer, tableBase: number): { family: string; subfamily: string } | null {
	if (tableBase + 6 > buf.length) return null
	const count        = buf.readUInt16BE(tableBase + 2)
	const stringOffset = buf.readUInt16BE(tableBase + 4)

	// Collect candidate strings keyed by `${platformId}-${nameId}`.
	// Prefer Windows/English (platform 3, lang 0x0409) over Mac (platform 1, lang 0).
	const best = new Map<string, { value: string; priority: number }>()

	for (let i = 0; i < count; i++) {
		const rec = tableBase + 6 + i * 12
		if (rec + 12 > buf.length) break

		const platformId = buf.readUInt16BE(rec)
		const encodingId = buf.readUInt16BE(rec + 2)
		const languageId = buf.readUInt16BE(rec + 4)
		const nameId     = buf.readUInt16BE(rec + 6)
		const strLen     = buf.readUInt16BE(rec + 8)
		const strOff     = buf.readUInt16BE(rec + 10)

		if (nameId !== 1 && nameId !== 2 && nameId !== 16 && nameId !== 17) continue

		const strStart = tableBase + stringOffset + strOff
		if (strStart + strLen > buf.length) continue

		let decoded: string | null = null
		let priority = 0

		if (platformId === 3 && encodingId === 1) {
			// Windows — UTF-16BE
			decoded = decodeUtf16BE(buf, strStart, strLen)
			priority = languageId === 0x0409 ? 2 : 1  // prefer English
		} else if (platformId === 1 && encodingId === 0) {
			// Mac Roman — effectively Latin-1 for ASCII name strings
			decoded = buf.toString('latin1', strStart, strStart + strLen)
			priority = languageId === 0 ? 1 : 0  // prefer English
		}

		if (decoded === null) continue

		const key = `${platformId}-${nameId}`
		const existing = best.get(key)
		if (!existing || priority > existing.priority) {
			best.set(key, { value: decoded, priority })
		}
	}

	// nameID 16 (typographic family) ?? nameID 1
	const family =
		best.get('3-16')?.value ??
		best.get('1-16')?.value ??
		best.get('3-1')?.value  ??
		best.get('1-1')?.value

	// nameID 17 (typographic subfamily) ?? nameID 2
	const subfamily =
		best.get('3-17')?.value ??
		best.get('1-17')?.value ??
		best.get('3-2')?.value  ??
		best.get('1-2')?.value

	if (!family) return null
	return { family, subfamily: subfamily ?? '' }
}

function decodeUtf16BE(buf: Buffer, start: number, len: number): string {
	let s = ''
	for (let i = 0; i < len - 1; i += 2) {
		s += String.fromCodePoint(buf.readUInt16BE(start + i))
	}
	return s
}

// ── subfamily → role mapping ──────────────────────────────────────────────────

type SubfamilyRole = 'regular' | 'bold' | 'italic' | 'boldItalic'

function subfamilyToRole(subfamily: string): SubfamilyRole | null {
	const s = subfamily.toLowerCase().replace(/\s+/g, ' ').trim()
	if (s === '' || s === 'regular' || s === 'roman' || s === 'normal') return 'regular'
	if (s === 'bold') return 'bold'
	if (s === 'italic' || s === 'oblique') return 'italic'
	if (s === 'bold italic' || s === 'bold oblique') return 'boldItalic'
	return null
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Scan font files and return a Map from each requested family name (as supplied in `families`) to
 * its resolved role paths. Matching is case-insensitive and exact — "Inter" never matches
 * "Inter Tight".
 *
 * `source` is a directory path or an explicit list of font file paths.
 * `families` is a list of wanted family names (e.g. `['Inter', 'Roboto']`).
 *
 * Every requested family appears in the returned Map. Families that were not found carry
 * `{ matchedBy: 'none' }`; found families carry `{ matchedBy: 'name-table', ...rolePaths }`.
 * A file whose subfamily is not one of Regular/Bold/Italic/Bold Italic is used as a `regular`
 * fallback if no regular has been found for that family yet — this covers single-variant icon
 * fonts (e.g. Font Awesome Solid) that carry a non-standard subfamily name.
 */
export function resolveFontFiles(
	source: string | string[],
	families: string[],
	opts?: ResolveFontFilesOptions,
): Map<string, FontFiles> {
	const exts = new Set((opts?.exts ?? DEFAULT_EXTS).map(e => e.toLowerCase()))

	// Build a lookup: lowercase family name → caller-supplied casing
	const wantedMap = new Map(families.map(f => [f.toLowerCase(), f]))

	const candidates = collectCandidates(source, exts)

	const result = new Map<string, FontFiles>()

	for (const filePath of candidates) {
		let buf: Buffer
		try { buf = fs.readFileSync(filePath) } catch { continue }

		const nameInfo = readFontName(buf)
		if (!nameInfo) continue

		const callerFamily = wantedMap.get(nameInfo.family.toLowerCase())
		if (!callerFamily) continue

		if (!result.has(callerFamily)) result.set(callerFamily, { matchedBy: 'name-table' })
		const entry = result.get(callerFamily)!

		const role = subfamilyToRole(nameInfo.subfamily)
		if (role !== null) {
			if (!entry[role]) entry[role] = filePath
		} else {
			// Non-standard subfamily (e.g. 'Solid', 'Light'): use as regular fallback
			if (!entry.regular) entry.regular = filePath
		}
	}

	// Ensure every requested family appears — missing ones get matchedBy: 'none'
	for (const [, callerFamily] of wantedMap) {
		if (!result.has(callerFamily)) result.set(callerFamily, { matchedBy: 'none' })
	}

	return result
}

function collectCandidates(source: string | string[], exts: Set<string>): string[] {
	if (Array.isArray(source)) {
		return source.filter(f => exts.has(path.extname(f).toLowerCase()))
	}
	try {
		return fs
			.readdirSync(source)
			.filter(e => exts.has(path.extname(e).toLowerCase()))
			.map(e => path.join(source, e))
	} catch {
		return []
	}
}
