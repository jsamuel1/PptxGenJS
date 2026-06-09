/**
 * PptxGenJS — HTML content extractors (docs/feature-html-content-extractors.md).
 *
 * Neutral, structural recognisers that turn a common HTML structure into faithful data — the
 * `parseCards()` profile extended to the other structures every HTML→PPTX converter re-implements.
 *
 * DESIGN PRINCIPLE (do not violate): these extractors **represent** the HTML, they do NOT classify
 * it into an editorial "archetype". There is no `Archetype` type, no `classifySlide()`, no named
 * slide-kind enum. Each extractor answers one question — "is THIS structure present, and what is
 * its data?" — and returns data or `null`/`[]`. Extraction is ADDITIVE: a single input may yield a
 * `parseTable` result AND `parseColumns` AND (in Slice 2b) a quote/timeline/badges/callout; the
 * consumer composes them. Naming follows the HTML structure or a real PowerPoint construct
 * (`parseTable` ↔ OOXML table, `parseColumns` ↔ multi-column text), never a slide role.
 *
 * Pure, synchronous, DEPENDENCY-FREE — reuses `parseHtml`/`query`/`textOf`/`closest` from
 * `./html-dom` and the shared colour context from `./css-context`. Colours are NEVER guessed: where
 * no colour is detectable the field is simply omitted.
 *
 * This Slice ships the two extractors with the clearest structural / PPTX anchor: `parseTable` and
 * `parseColumns`. `parseTimeline`/`parseQuote`/`parseBadges`/`parseCallout` follow in a sibling slice.
 */
import { parseHtml, query, textOf, closest, elements, classMatch } from './html-dom'
import type { HNode } from './html-dom'
import { parseStyleSheets, colorOf, cssProp, EMPTY_CSS } from './css-context'
import type { CssContext, HexColor } from './css-context'

/** A single parsed table cell, shaped to map onto `slide.addTable()` rows. */
export interface TableCell {
	/** Cell text (trimmed). */
	text: string
	/** True when the source cell was a `<th>` (→ bold/header options). */
	isHeader: boolean
	/** Cell text colour (6-digit hex, no `#`), when detectable. Omitted otherwise. */
	color?: HexColor
}

/** A parsed HTML `<table>`: rows of cells. Maps straight onto `slide.addTable()`. */
export interface TableData {
	rows: TableCell[][]
}

/** One detected column of a multi-column structure. */
export interface ColumnData { text: string }

/** Options shared by the content extractors (mirrors `parseCards`). */
export interface ParseContentOptions {
	/** Class pattern; elements within a matching region are skipped (mockups/flows). */
	excludeWithin?: RegExp
}

/**
 * Resolve the input to a root {@link HNode}. Accepts a raw HTML string (parsed fresh) OR an `HNode`
 * already produced by `parseHtml` (so callers can parse once and query many).
 */
function toRoot (input: string | HNode): HNode {
	return typeof input === 'string' ? parseHtml(input) : input
}

/**
 * Build the colour-resolution context for an input. Class-rule resolution needs the `<style>`
 * source text, so it is available only for STRING input. A detached `HNode` carries no stylesheet
 * source → `EMPTY_CSS` (inline-style colours on the node still resolve). Documented limitation.
 */
function ctxOf (input: string | HNode): CssContext {
	return typeof input === 'string' ? parseStyleSheets(input) : EMPTY_CSS
}

/** True when `el` (or an ancestor) matches the exclude pattern. */
function isExcluded (el: HNode, pat: RegExp): boolean {
	let cur: HNode | null = el
	while (cur) { if (cur.classes.length && classMatch(cur, pat)) return true; cur = cur.parent }
	return false
}

/**
 * Parse the first HTML `<table>` into neutral `TableData` (rows of `{ text, isHeader, color? }`).
 *
 * Cells of a deeper NESTED `<table>` are not double-counted — a cell is kept only when its nearest
 * ancestor `<table>` is the table being parsed. A `<table>` with zero `<tr>` returns `{ rows: [] }`
 * (still a table); only the absence of any `<table>` element returns `null`.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips rows inside a matching region.
 * @returns the table's rows, or `null` when there is no `<table>`.
 */
export function parseTable (input: string | HNode, opts: ParseContentOptions = {}): TableData | null {
	const root = toRoot(input)
	const exclPat = opts.excludeWithin
	// First non-excluded <table> in document order.
	const table = query(root, 'table').find(t => !exclPat || !isExcluded(t, exclPat)) || null
	if (!table) return null
	const ctx = ctxOf(input)
	const rows: TableCell[][] = []
	for (const tr of query(table, 'tr')) {
		// only rows belonging to THIS table (not a deeper nested table)
		if (closest(tr, 'table') !== table) continue
		const cells: TableCell[] = []
		for (const cell of query(tr, 'th,td')) {
			// guard against nested-table cells (keep only this table's cells)
			if (closest(cell, 'table') !== table) continue
			const out: TableCell = { text: textOf(cell).trim(), isHeader: cell.tag === 'th' }
			const color = colorOf(cell, 'color', ctx)
			if (color) out.color = color
			cells.push(out)
		}
		rows.push(cells)
	}
	return { rows }
}

/** The column count declared by `column-count` or a `columns:` shorthand on `el` (0 when none/<1). */
function columnCountOf (el: HNode, ctx: CssContext): number {
	const cc = cssProp(el, 'column-count', ctx)
	if (cc) { const n = parseInt(cc, 10); if (isFinite(n)) return n }
	const cols = cssProp(el, 'columns', ctx)
	if (cols) {
		// `columns: <width>? <count>?` — the bare integer token (no length unit) is the count.
		for (const t of cols.trim().split(/\s+/)) {
			if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (isFinite(n)) return n }
		}
	}
	return 0
}

/**
 * Detect an EXPLICIT multi-column structure and return one `{ text }` per column. The only safe,
 * non-judgemental signals are:
 *  - a container with ≥2 direct-child elements each carrying a `col`/`column`/`col-*` class, or
 *  - a container whose inline style / class rule sets `column-count` ≥ 2 (or a `columns:` shorthand
 *    with a count ≥ 2) — in which case each top-level block child of the container is one column.
 *
 * Plain prose, a single block, or a `<table>` are NOT columns → `null` (a table is never columns).
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips containers inside a matching region.
 * @returns one entry per detected column, or `null` when no explicit multi-column structure exists.
 */
export function parseColumns (input: string | HNode, opts: ParseContentOptions = {}): ColumnData[] | null {
	const root = toRoot(input)
	const ctx = ctxOf(input)
	const exclPat = opts.excludeWithin
	for (const el of elements(root)) {
		if (el.tag === 'table') continue // a table is never columns
		if (exclPat && isExcluded(el, exclPat)) continue
		const childEls = el.children.filter(c => c.tag !== '#text')
		if (childEls.length < 2) continue
		// (a) explicit column children: ≥2 direct children each with a `col`-ish class
		const colChildren = childEls.filter(c => c.classes.some(cl => /col/i.test(cl)))
		if (colChildren.length >= 2) {
			return colChildren.map(c => ({ text: textOf(c).trim() }))
		}
		// (b) CSS column-count / columns shorthand ≥ 2 → each top-level block child is a column
		if (columnCountOf(el, ctx) >= 2) {
			return childEls.map(c => ({ text: textOf(c).trim() }))
		}
	}
	return null
}
