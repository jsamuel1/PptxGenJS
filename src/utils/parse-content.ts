/**
 * PptxGenJS — HTML content extractors (docs/features/feature-html-content-extractors.md).
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
 * Pure, synchronous, DEPENDENCY-FREE — reuses `parseHtml`/`query`/`queryOne`/`textOf`/`closest`/
 * `elements`/`classMatch`/`isAncestorOrSelf` from `./html-dom` and the shared colour context from
 * `./css-context`. Colours are NEVER guessed: where no colour is detectable the field is omitted.
 *
 * Ships all six neutral extractors: `parseTable` and `parseColumns` (clearest structural / PPTX
 * anchor), plus `parseTimeline`, `parseQuote`, `parseBadges`, and `parseCallout`.
 */
import { parseHtml, query, queryOne, textOf, closest, elements, classMatch, isAncestorOrSelf, isExcluded, leadingEmoji } from './html-dom'
import type { HNode } from './html-dom'
import { parseStyleSheets, colorOf, bgOfCtx, flexInfoOf, columnCountOf, EMPTY_CSS } from './css-context'
import type { CssContext, HexColor } from './css-context'
import { isFontIconEl, TILE_LABEL_MAX } from './icon-classify'
import { isBadgeEl, BADGE_CLASS_PAT } from './badge-classify'

/** A single parsed table cell, shaped to map onto `slide.addTable()` rows. */
export interface TableCell {
	/** Cell text (trimmed). */
	text: string
	/** True when the source cell was a `<th>` (→ bold/header options). */
	isHeader: boolean
	/** Cell text colour (6-digit hex, no `#`), when detectable. Omitted otherwise. */
	color?: HexColor
	/** Column span (omitted when 1). Maps to PptxGenJS `options.colspan`. */
	colspan?: number
	/** Row span (omitted when 1). Maps to PptxGenJS `options.rowspan`. */
	rowspan?: number
}

/** A parsed HTML `<table>`: rows of cells. Maps straight onto `slide.addTable()`. */
export interface TableData {
	rows: TableCell[][]
}

/** One detected column of a multi-column structure. */
export interface ColumnData { text: string }

/** A single icon+label tile within a {@link TileRow}. */
export interface TileData {
	/** Tile label (the short text beside/under the icon; trimmed). */
	label: string
	/**
	 * The tile's icon, when one is present. `svg` carries the verbatim `<svg>…</svg>` markup
	 * (feed to `parseSvg`); `fontIcon` carries the icon element's class string; `emoji` carries the
	 * leading pictographic cluster. Omitted when the tile has no recognisable icon.
	 */
	icon?:
		| { type: 'svg', raw: string }
		| { type: 'fontIcon', className: string }
		| { type: 'emoji', text: string }
}

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

// ──────────────────────────────────────────────────────────────────────────────────────────
// Icon detection (class-agnostic) — shared by `parseTiles` and the `parseColumns` tile guard.
// Structural, NOT class-name driven: an inline `<svg>`, a recognised icon-font `<i>`/`<span>`
// (via the shared `isFontIconEl` guard in `icon-classify`), or a leading emoji cluster (via the
// shared `leadingEmoji` in `html-dom`) all count as "an icon node".
// ──────────────────────────────────────────────────────────────────────────────────────────

/** First recognised font-icon `<i>`/`<span>` within `el`'s subtree, or null. Class-agnostic. */
function findFontIconEl (el: HNode): HNode | null {
	const scan = (n: HNode): HNode | null => {
		for (const c of n.children) {
			if (c.tag === '#text') continue
			if (isFontIconEl(c)) return c
			const hit = scan(c)
			if (hit) return hit
		}
		return null
	}
	return scan(el)
}

/**
 * The icon descriptor of a single tile: an `<svg>`, a recognised font-icon `<i>`/`<span>`, or a
 * leading-emoji text cluster. Returns `null` when the element carries no recognisable icon.
 */
function tileIcon (el: HNode): { kind: 'svg', el: HNode } | { kind: 'fontIcon', el: HNode } | { kind: 'emoji', text: string } | null {
	const svg = queryOne(el, 'svg')
	if (svg) return { kind: 'svg', el: svg }
	const fi = findFontIconEl(el)
	if (fi) return { kind: 'fontIcon', el: fi }
	const em = leadingEmoji(textOf(el))
	if (em) return { kind: 'emoji', text: em }
	return null
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
			const cs = parseInt(cell.attrs.colspan, 10)
			if (cs > 1) out.colspan = cs
			const rs = parseInt(cell.attrs.rowspan, 10)
			if (rs > 1) out.rowspan = rs
			cells.push(out)
		}
		rows.push(cells)
	}
	return { rows }
}

/**
 * A column child's class token: anchored `col` / `column` / `col-<n>` (case-insensitive).
 * Anchored `^…$` (the per-class `some` already iterates each individual class token), so it
 * REJECTS substring lookalikes — `collapse`, `protocol`, `colour-swatch`, `col-header`,
 * `column-count`. Bootstrap responsive forms (`col-md-6`) are intentionally out of scope.
 */
const COL_CLASS = /^col(?:umn)?(?:-\d+)?$/i

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
		const colChildren = childEls.filter(c => c.classes.some(cl => COL_CLASS.test(cl)))
		if (colChildren.length >= 2) {
			return colChildren.map(c => ({ text: textOf(c).trim() }))
		}
		// (b) CSS column-count / columns shorthand ≥ 2 → each top-level block child is a column
		if (columnCountOf(el, ctx) >= 2) {
			return childEls.map(c => ({ text: textOf(c).trim() }))
		}
		// (c) flex row layout with ≥ 2 children → each child is a column. GATE (SAU-40): an
		// icon+label TILE row is NOT prose columns — flattening it to text would drop the icons and
		// pre-empt `parseTiles`, so the eager branch yields to the tile recogniser. A genuine prose
		// flex row (children with no icon / a long label) is not a tile row → unchanged behaviour.
		const fi = flexInfoOf(el, ctx)
		if (fi && fi.direction === 'row' && !tileChildrenOf(el, TILE_LABEL_MAX)) {
			return childEls.map(c => ({ text: textOf(c).trim() }))
		}
	}
	return null
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Slice 2b — parseTimeline / parseQuote / parseBadges / parseCallout
//
// Same NEUTRAL contract: each answers "is THIS structure present, and what is its data?" and
// returns data or `null`/`[]`. No archetype/`classifySlide` judgement. Both `string` and `HNode`
// inputs are accepted via the shared `toRoot`/`ctxOf` helpers above.
// ──────────────────────────────────────────────────────────────────────────────────────────

/** One row of a timeline: a time/marker token plus the remaining row text. */
export interface TimelineRow {
	/** The time/marker token, e.g. `'7:00 AM'` or a `.time`/`.timeline-time` element's text. */
	marker: string
	/** The remaining row text (the marker stripped from the front). */
	body: string
}

/** A parsed quotation + optional attribution. */
export interface QuoteData {
	/** The quotation text, surrounding quote glyphs and the attribution substring removed. */
	text: string
	/** The `cite`/`.quote-attr` text, when present. Omitted otherwise. */
	attribution?: string
}

/**
 * A parsed pill/badge/eyebrow/kicker/section-label. `bg`/`color` (the pill's RESOLVED background
 * and text colour, 6-digit hex, no `#`) are OMITTED when undetectable — never guessed (ADR colour
 * rule), so a consumer keeps its own default rather than warning.
 */
export interface BadgeData {
	/** The pill's text (trimmed). */
	text: string
	/** Resolved background/fill colour (6-hex, no `#`), when detectable via the cascade. Omitted otherwise. */
	bg?: HexColor
	/** Resolved text colour (6-hex, no `#`), when detectable via the cascade. Omitted otherwise. */
	color?: HexColor
}

/** A parsed callout (bordered/`.callout` box). */
export interface CalloutData {
	/** The callout's text. */
	text: string
	/** The border/border-left/border-color colour (6-digit hex, no `#`), when detectable. Omitted otherwise. */
	accent?: HexColor
}

/** Leading-time matcher (`7:00`, `12:30 PM`, …). Case-insensitive. */
const TIME_RE = /^(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)/i

/** The leading time token of a string (whitespace-normalised, upper-cased), or `null` when none. */
function leadingTime (s: string): string | null {
	const m = TIME_RE.exec(s.trim())
	return m ? m[1].replace(/\s+/g, ' ').toUpperCase() : null
}

/** Strip a known prefix (case-insensitively) from `full`, else remove the first occurrence; trimmed. */
function stripPrefix (full: string, marker: string): string {
	if (!marker) return full.trim()
	if (full.toUpperCase().startsWith(marker.toUpperCase())) return full.slice(marker.length).trim()
	return full.replace(marker, '').trim()
}

/** Collect body text from `el` excluding the subtree rooted at `exclude`, joining child blocks with ` — `. */
function bodyWithout (el: HNode, exclude: HNode): string {
	const parts: string[] = []
	for (const child of el.children) {
		if (child === exclude || isAncestorOrSelf(child, exclude)) continue
		const t = textOf(child).trim()
		if (t) parts.push(t)
	}
	return parts.join(' \u2014 ')
}

/** Strip surrounding straight/curly/guillemet/CJK quote glyphs from `s`. */
function stripQuoteGlyphs (s: string): string {
	return s
		.replace(/^[\s"'\u201C\u201D\u2018\u2019\u00AB\u00BB\u300C\u300D\u300E\u300F]+/, '')
		.replace(/[\s"'\u201C\u201D\u2018\u2019\u00AB\u00BB\u300C\u300D\u300E\u300F]+$/, '')
		.trim()
}

/**
 * Parse a list of time-stamped rows into neutral `{ marker, body }` rows. Detection priority:
 *  - EXPLICIT: `.timeline-item` elements, else the direct element children of the first `.timeline`
 *    container. Each row's `marker` is a `.time`/`.timeline-time` descendant's text when present,
 *    else the row's leading time token; `body` is the row text with the marker stripped.
 *  - HEURISTIC (only when explicit finds nothing): elements whose text STARTS WITH a time token.
 *    Nested wrappers are de-duped — a candidate is dropped when an ANCESTOR candidate has the SAME
 *    leading time token, so a row wrapped N-deep counts once (the outermost match wins).
 *
 * NEUTRAL: it never decides "this is a timeline slide". Returns `null` when no rows are found.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips rows inside a matching region.
 */
export function parseTimeline (input: string | HNode, opts: ParseContentOptions = {}): TimelineRow[] | null {
	const root = toRoot(input)
	const exclPat = opts.excludeWithin

	// (a) EXPLICIT — `.timeline-item`, else the direct children of the first `.timeline` container.
	let rowEls = query(root, '.timeline-item')
	if (rowEls.length === 0) {
		const containers = query(root, '.timeline')
		if (containers.length > 0) rowEls = containers[0].children.filter(c => c.tag !== '#text')
	}
	if (rowEls.length > 0) {
		const rows: TimelineRow[] = []
		for (const el of rowEls) {
			if (exclPat && isExcluded(el, exclPat)) continue
			const full = textOf(el).trim()
			// Prefer <time datetime> → .time → .timeline-time → leading regex
			const dtEl = queryOne(el, 'time[datetime]')
			const timeEl = dtEl || queryOne(el, '.time') || queryOne(el, '.timeline-time')
			const marker = dtEl ? (dtEl.attrs.datetime || textOf(dtEl).trim())
				: timeEl ? textOf(timeEl).trim()
					: (leadingTime(full) || '')
			const body = timeEl ? bodyWithout(el, timeEl) : stripPrefix(full, marker)
			rows.push({ marker, body })
		}
		if (rows.length > 0) return rows
	}

	// (b) HEURISTIC — elements whose text starts with a time token OR containing <time datetime>.
	const hasTime = (el: HNode): string | null => {
		const dtEl = queryOne(el, 'time[datetime]')
		if (dtEl) return dtEl.attrs.datetime || textOf(dtEl).trim() || null
		return leadingTime(textOf(el))
	}
	const cands = elements(root).filter(el =>
		(!exclPat || !isExcluded(el, exclPat)) &&
		!(el.tag === 'time' && el.attrs.datetime) &&
		hasTime(el) !== null)
	// De-dup: prefer INNERMOST — drop el if it is an ancestor of another candidate with the same time
	const kept = cands.filter(el => {
		const t = hasTime(el)
		return !cands.some(o => o !== el && isAncestorOrSelf(el, o) && hasTime(o) === t)
	})
	if (kept.length === 0) return null
	return kept.map(el => {
		const dtEl = queryOne(el, 'time[datetime]')
		if (dtEl) {
			const marker = dtEl.attrs.datetime || textOf(dtEl).trim()
			return { marker, body: bodyWithout(el, dtEl) }
		}
		const full = textOf(el).trim()
		const marker = leadingTime(full) || ''
		return { marker, body: stripPrefix(full, marker) }
	})
}

/**
 * Parse the first quotation into `{ text, attribution? }`. The quote element is the first
 * `blockquote`, else the first `.quote-text`. The `attribution` is a `cite`/`.quote-attr`
 * descendant's text (omitted when absent); it is removed from `text`, and surrounding quote glyphs
 * are stripped. NEUTRAL: it never decides "this slide IS a quote". Returns `null` when no quote.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips a quote inside a matching region.
 */
export function parseQuote (input: string | HNode, opts: ParseContentOptions = {}): QuoteData | null {
	const root = toRoot(input)
	const exclPat = opts.excludeWithin
	const candidates = [...query(root, 'blockquote'), ...query(root, '.quote-text'), ...query(root, 'q')]
	const quoteEl = candidates.find(el => !exclPat || !isExcluded(el, exclPat)) || null
	if (!quoteEl) return null

	// Attribution: cite > .quote-attr > footer (inside quote) > figcaption (sibling in <figure>)
	let attrEl = queryOne(quoteEl, 'cite') || queryOne(quoteEl, '.quote-attr') || queryOne(quoteEl, 'footer')
	if (!attrEl && quoteEl.parent && quoteEl.parent.tag === 'figure') {
		attrEl = queryOne(quoteEl.parent, 'figcaption') || null
	}
	const attribution = attrEl ? textOf(attrEl).trim() : undefined

	let text = textOf(quoteEl).trim()
	if (attribution) text = text.replace(attribution, '').trim()
	text = stripQuoteGlyphs(text)
	const out: QuoteData = { text }
	if (attribution) out.attribution = attribution
	return out
}

/**
 * Parse pill/badge/eyebrow/kicker/section-label labels into `BadgeData[]` (NOT `null` — `[]` when
 * none). Recognition is GENERIC / structure-driven (shared `isBadgeEl` in `./badge-classify`, also
 * used by `parseCards`): an element is a pill when its class TOKEN matches the generalised pill
 * family (`badge|pill|tag|count|chip|kicker|eyebrow|section-label`) OR it is a SHORT ALL-CAPS label
 * sitting immediately above a heading (the eyebrow-above-a-title arrangement, no pill class needed).
 * Each kept pill carries its RESOLVED `bg`/`color` from the css cascade (`bgOfCtx`/`colorOf`) when
 * detectable; the colour fields are OMITTED, never guessed, when absent.
 *
 * Excluded regions are skipped, nested matches are de-duped (the outermost pill wins), and empties
 * are dropped. NEUTRAL — labels + colour only, no slide-role judgement.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips badges inside a matching region.
 */
export function parseBadges (input: string | HNode, opts: ParseContentOptions = {}): BadgeData[] {
	const root = toRoot(input)
	const ctx = ctxOf(input)
	const exclPat = opts.excludeWithin
	const matched = elements(root).filter(el =>
		(!exclPat || !isExcluded(el, exclPat)) && isBadgeEl(el, BADGE_CLASS_PAT))
	// nested de-dup: drop a badge that has a badge ANCESTOR (keep the outermost)
	const kept = matched.filter(el => !matched.some(o => o !== el && isAncestorOrSelf(o, el)))
	const out: BadgeData[] = []
	for (const el of kept) {
		const t = textOf(el).trim()
		if (!t) continue
		const b: BadgeData = { text: t }
		const bg = bgOfCtx(el, ctx)
		if (bg) b.bg = bg
		const color = colorOf(el, 'color', ctx)
		if (color) b.color = color
		out.push(b)
	}
	return out
}

/** The first detectable border colour of `el` (border-left › border-color › border), or undefined. */
function calloutAccent (el: HNode, ctx: CssContext): HexColor | undefined {
	return colorOf(el, 'border-left', ctx) || colorOf(el, 'border-color', ctx) || colorOf(el, 'border', ctx)
}

/**
 * Parse the first callout — a BORDERED box (a detectable `border`/`border-left`/`border-color`
 * colour) OR a `[class*="callout"]` element — into `{ text, accent? }`. The first non-excluded match
 * in document order wins; `accent` is the resolved border colour when detectable (omitted otherwise).
 * NEUTRAL — structural only. Returns `null` when no bordered/callout box exists.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips a callout inside a matching region.
 */
export function parseCallout (input: string | HNode, opts: ParseContentOptions = {}): CalloutData | null {
	const root = toRoot(input)
	const ctx = ctxOf(input)
	const exclPat = opts.excludeWithin
	for (const el of elements(root)) {
		if (exclPat && isExcluded(el, exclPat)) continue
		const accent = calloutAccent(el, ctx)
		if (accent || classMatch(el, /callout/i)) {
			const out: CalloutData = { text: textOf(el).trim() }
			if (accent) out.accent = accent
			return out
		}
	}
	return null
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// parseTiles — structure-driven icon+label tile rows (the dropped AWS-service rows; SAU-40)
//
// A "tile row" is a horizontal strip of ≥2 UNIFORM sibling tiles where each tile = one icon node
// (svg / recognised font-icon / leading emoji) + a SHORT label. Detection is STRUCTURE-driven, not
// class-name driven (works for `.stack-row` / `.reg-badge` AND class-token-free equivalents) and does
// NOT require any stylesheet-resolvable CSS — exactly the rows `parseCards`/`parseColumns` drop when
// a flex/grid row carries no recognisable class vocabulary and no inline/`<style>` display.
// ──────────────────────────────────────────────────────────────────────────────────────────

// `TILE_LABEL_MAX` (the SHORT-label magic) is the shared constant from `./icon-classify` — one
// source for the tile-label limit across `parseCards` and `parseContent` (SAU-40 de-dup).

/** Build a {@link TileData} from one tile element. `null` when it carries no icon or no label. */
function analyzeTile (el: HNode, labelMax: number): TileData | null {
	const ic = tileIcon(el)
	if (!ic) return null
	// Label = the tile's full text with a leading emoji icon stripped (svg/font-icon carry no text).
	let label = textOf(el).trim()
	if (ic.kind === 'emoji' && label.startsWith(ic.text)) label = label.slice(ic.text.length).trim()
	if (!label || label.length > labelMax) return null
	const out: TileData = { label }
	if (ic.kind === 'svg') out.icon = { type: 'svg', raw: ic.el.raw || '' }
	else if (ic.kind === 'fontIcon') out.icon = { type: 'fontIcon', className: ic.el.classes.join(' ') }
	else out.icon = { type: 'emoji', text: ic.text }
	return out
}

/**
 * True when `container`'s direct element children form a UNIFORM icon+label tile row: ≥2 children,
 * EVERY child is a valid tile (icon + short label), and the children are structurally uniform (each
 * has the same small element-child count, within ±1). Class- and CSS-agnostic.
 */
function tileChildrenOf (container: HNode, labelMax: number): TileData[] | null {
	const childEls = container.children.filter(c => c.tag !== '#text')
	if (childEls.length < 2) return null
	const tiles: TileData[] = []
	for (const c of childEls) {
		const t = analyzeTile(c, labelMax)
		if (!t) return null // EVERY child must be a tile — a single non-tile child rejects the row
		tiles.push(t)
	}
	// Uniformity: child element-counts must be tight (tile rows are repeated identical structures).
	const counts = childEls.map(c => c.children.filter(k => k.tag !== '#text').length)
	const avg = counts.reduce((s, n) => s + n, 0) / counts.length
	if (counts.some(n => Math.abs(n - avg) > 1)) return null
	return tiles
}

/**
 * Detect the first horizontal row of icon+label tiles and return one {@link TileData} per tile.
 *
 * STRUCTURE-driven (SAU-40): a tile row is ≥2 uniform sibling elements, each carrying one icon node
 * (inline `<svg>`, a recognised icon-font `<i>`/`<span>`, or a leading emoji) plus a SHORT label.
 * Independent of class vocabulary and resolvable CSS, so it recovers `.stack`/`.stack-row`/`.reg-badge`
 * rows AND class-token-free equivalents that `parseCards`/`parseColumns` would otherwise drop. The
 * OUTERMOST qualifying container in document order wins (a nested duplicate is not re-reported).
 *
 * NEUTRAL — it never decides "this is a tile slide". Returns `[]` (not `null`) when none is found, so
 * a non-participating input adds nothing. `labelMax` clamps the per-tile label length.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param opts - `excludeWithin` skips tile rows inside a matching region.
 */
export function parseTiles (input: string | HNode, opts: ParseContentOptions = {}): TileData[] {
	const root = toRoot(input)
	const exclPat = opts.excludeWithin
	const labelMax = TILE_LABEL_MAX
	for (const el of elements(root)) {
		if (el.tag === 'table') continue
		if (exclPat && isExcluded(el, exclPat)) continue
		const tiles = tileChildrenOf(el, labelMax)
		if (tiles) return tiles
	}
	return []
}
