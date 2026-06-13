'use strict'

// Feature: HTML content extractors — parseTable + parseColumns (Slice 2a)
// (docs/features/feature-html-content-extractors.md).
//
// NEUTRAL, ADDITIVE structural recognisers — they represent the HTML, they do NOT classify it into
// an "archetype". Each answers "is THIS structure present, and what is its data?" and returns data
// or null. parseTable maps to an OOXML table; parseColumns maps to multi-column text. Colours reuse
// the shared parseCards colour context (./css-context) and are NEVER guessed (field omitted when
// undetectable). Both accept a raw HTML string OR an HNode produced by parseHtml.

const { assert } = require('./helpers')
const {
	parseTable, parseColumns, parseTimeline, parseQuote, parseBadges, parseCallout, parseHtml,
} = require('../src/bld/utils.cjs.js')

module.exports = [
	{
		name: 'parseTable: header detection + cell colour (spec fixture)',
		fn: async () => {
			const t = parseTable('<table><tr><th>Name</th><th>Role</th></tr><tr><td style="color:#10B981">Ada</td><td>Eng</td></tr></table>')
			assert(t !== null, 'expected a TableData, got null')
			assert(t.rows.length === 2, 'expected 2 rows; got: ' + t.rows.length)
			assert(t.rows[0][0].isHeader === true, 'row0 cell0 should be a header (<th>)')
			assert(t.rows[0][1].text === 'Role', 'row0 cell1 text should be Role; got: ' + t.rows[0][1].text)
			// REGRESSION-CATCH (mem-1): the EXACT resolved colour. If colorOf/extractHex wiring (the
			// css-context factor) regressed, this 6-hex uppercased, hash-stripped value would change.
			assert(t.rows[1][0].color === '10B981', 'row1 cell0 colour should be 10B981; got: ' + t.rows[1][0].color)
			assert(t.rows[1][0].isHeader === false, 'row1 cell0 should NOT be a header (<td>)')
			assert(t.rows[1][1].isHeader === false, 'row1 cell1 should NOT be a header (<td>)')
			// colour is OMITTED, never guessed, when undetectable
			assert(!('color' in t.rows[1][1]), 'a cell with no colour must omit the color field')
		},
	},
	{
		name: 'parseTable: colour via <style> class rule (shared css-context)',
		fn: async () => {
			// Proves parseTable resolves colours through the SAME <style>/var() context as parseCards
			// (the factored css-context.ts), not just inline styles.
			const t = parseTable('<style>.hot{color:#FF0000}</style><table><tr><td class="hot">x</td></tr></table>')
			assert(t.rows[0][0].color === 'FF0000', 'class-rule colour should resolve to FF0000; got: ' + t.rows[0][0].color)
		},
	},
	{
		name: 'parseTable: nested table cells are not double-counted',
		fn: async () => {
			const html = '<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>'
			const t = parseTable(html)
			// Outer table has exactly one row with one cell (the inner table's row/cell belong to it,
			// not the outer table).
			assert(t.rows.length === 1, 'outer table should have exactly 1 row; got: ' + t.rows.length)
			assert(t.rows[0].length === 1, 'outer row should have exactly 1 cell; got: ' + t.rows[0].length)
		},
	},
	{
		name: 'parseTable: accepts an HNode input (parse once, query many)',
		fn: async () => {
			const root = parseHtml('<div><table><tr><td>a</td><td>b</td></tr></table></div>')
			const t = parseTable(root)
			assert(t !== null && t.rows.length === 1 && t.rows[0].length === 2, 'HNode input should yield 1 row of 2 cells')
		},
	},
	{
		name: 'parseTable: empty table is still a table ({rows:[]}, not null)',
		fn: async () => {
			const t = parseTable('<table></table>')
			assert(t !== null, 'an empty <table> is still a table, not null')
			assert(Array.isArray(t.rows) && t.rows.length === 0, 'empty table → { rows: [] }')
		},
	},
	{
		name: 'parseTable: no-false-positive — non-table input returns null',
		fn: async () => {
			// REGRESSION-CATCH (mem-1): MUST be null (not {rows:[]}, not a throw). If the "no <table>"
			// guard regressed, prose would wrongly produce an empty table.
			const r = parseTable('<p>just text</p>')
			assert(r === null, 'plain prose must return null; got: ' + JSON.stringify(r))
		},
	},
	{
		name: 'parseColumns: explicit .col children → one entry per column',
		fn: async () => {
			const cols = parseColumns('<div><div class="col">A</div><div class="col">B</div></div>')
			assert(cols !== null, 'expected ColumnData[], got null')
			assert(cols.length === 2, 'expected 2 columns; got: ' + cols.length)
			assert(cols[0].text === 'A' && cols[1].text === 'B', 'column texts should be A,B; got: ' + JSON.stringify(cols))
		},
	},
	{
		name: 'parseColumns: CSS column-count >= 2 → each block child is a column',
		fn: async () => {
			const cols = parseColumns('<div style="column-count:2"><p>one</p><p>two</p></div>')
			assert(cols !== null && cols.length === 2, 'column-count:2 should yield 2 columns; got: ' + JSON.stringify(cols))
			assert(cols[0].text === 'one' && cols[1].text === 'two', 'texts should be one,two')
		},
	},
	{
		name: 'parseColumns: no-false-positive — prose AND a bare table return null',
		fn: async () => {
			assert(parseColumns('<p>just text</p>') === null, 'plain prose must return null')
			// A table is NEVER columns (explicitly guarded).
			assert(parseColumns('<table><tr><td>a</td><td>b</td></tr></table>') === null, 'a bare table must NOT be treated as columns')
		},
	},
	{
		name: 'composability: one input yields BOTH a table and columns (additive, no archetype)',
		fn: async () => {
			// The same HTML legitimately contains a multi-column region AND a table; the extractors run
			// independently and BOTH report — no single-archetype collapse.
			const html = '<section><div><div class="col">L</div><div class="col">R</div></div><table><tr><td>x</td></tr></table></section>'
			assert(parseColumns(html) !== null, 'columns should be detected')
			assert(parseTable(html) !== null, 'table should be detected from the same input')
		},
	},
	{
		name: 'parseTable + parseColumns: excludeWithin skips matching regions',
		fn: async () => {
			// A table inside a `.mockup` region is skipped → no table found → null.
			const html = '<div class="mockup"><table><tr><td>x</td></tr></table></div>'
			assert(parseTable(html, { excludeWithin: /mockup/ }) === null, 'table inside excluded region should be skipped')
		},
	},
	{
		name: 'parseColumns: anchored col-class rejects substring lookalikes (REGRESSION-CATCH, Slice 2c)',
		fn: async () => {
			// REGRESSION-CATCH (mem-1): guards the `colChildren` filter predicate in parseColumns.
			// Two siblings whose classes merely CONTAIN the substring "col" (collapse, protocol) must
			// NOT be mistaken for a 2-column layout. On the pre-fix substring `/col/i` predicate this
			// wrongly returned [{…},{…}]; the anchored COL_CLASS regex returns null.
			assert(parseColumns('<div><div class="collapse">A</div><div class="protocol">B</div></div>') === null,
				'collapse/protocol siblings must NOT be treated as columns')
			assert(parseColumns('<div><div class="colour-swatch">A</div><div class="col-header">B</div></div>') === null,
				'colour-swatch/col-header siblings must NOT be treated as columns')
		},
	},
	{
		name: 'parseColumns: anchored col-class still accepts col / column / col-N (no-regression, Slice 2c)',
		fn: async () => {
			const c1 = parseColumns('<div><div class="col-6">A</div><div class="col-6">B</div></div>')
			assert(c1 !== null && c1.length === 2, 'col-6 children should still yield 2 columns; got: ' + JSON.stringify(c1))
			const c2 = parseColumns('<div><div class="column">A</div><div class="column">B</div></div>')
			assert(c2 !== null && c2.length === 2, 'column children should still yield 2 columns; got: ' + JSON.stringify(c2))
		},
	},
	// ── Slice 2b: parseTimeline / parseQuote / parseBadges / parseCallout ──────────────────
	{
		name: 'parseTimeline: explicit .timeline-item + .time marker (spec fixture)',
		fn: async () => {
			const tl = parseTimeline('<div class="timeline"><div class="timeline-item"><span class="time">7:00 AM</span> Standup</div><div class="timeline-item"><span class="time">9:00 AM</span> Build</div></div>')
			assert(tl !== null, 'expected TimelineRow[], got null')
			assert(tl.length === 2, 'expected 2 rows; got: ' + tl.length)
			assert(tl[0].marker === '7:00 AM', "row0 marker should be '7:00 AM'; got: " + tl[0].marker)
			assert(/Standup/.test(tl[0].body), 'row0 body should contain Standup; got: ' + tl[0].body)
		},
	},
	{
		name: 'parseTimeline: heuristic + nested-wrapper de-dup (REGRESSION-CATCH)',
		fn: async () => {
			// REGRESSION-CATCH (mem-1): the nested de-dup via isAncestorOrSelf. Each item is wrapped two
			// levels deep; without the same-leading-time ancestor skip this yields 5+ rows. Assert exactly 2.
			const tl2 = parseTimeline('<div><div><div>7:00 AM Wake</div></div><div><div>8:00 AM Run</div></div></div>')
			assert(tl2 !== null, 'expected TimelineRow[], got null')
			assert(tl2.length === 2, 'nested wrappers must collapse to exactly 2 rows; got: ' + tl2.length)
		},
	},
	{
		name: 'parseQuote: blockquote + cite (REGRESSION-CATCH on cite-removal + glyph-strip)',
		fn: async () => {
			// REGRESSION-CATCH (mem-1): exact 'Ship it'. If the cite-removal regressed, 'Grace' would
			// leak into text; if the glyph-strip regressed, the surrounding " quotes would remain.
			const q = parseQuote('<blockquote>"Ship it"<cite>Grace</cite></blockquote>')
			assert(q !== null, 'expected QuoteData, got null')
			assert(q.text === 'Ship it', "quote text should be exactly 'Ship it'; got: " + JSON.stringify(q.text))
			assert(q.attribution === 'Grace', "attribution should be 'Grace'; got: " + q.attribution)
		},
	},
	{
		name: 'parseBadges: badge + pill labels (spec fixture)',
		fn: async () => {
			const b = parseBadges('<span class="badge">NEW</span><span class="pill">BETA</span>')
			assert(b.length === 2, 'expected 2 badges; got: ' + b.length)
			assert(b[0] === 'NEW' && b[1] === 'BETA', 'badge labels should be NEW,BETA; got: ' + JSON.stringify(b))
		},
	},
	{
		name: 'parseCallout: bordered box resolves accent colour',
		fn: async () => {
			const c = parseCallout('<div style="border-left:4px solid #FF0000">Heads up</div>')
			assert(c !== null, 'expected CalloutData, got null')
			assert(c.text === 'Heads up', 'callout text should be Heads up; got: ' + c.text)
			assert(c.accent === 'FF0000', 'callout accent should be FF0000; got: ' + c.accent)
		},
	},
	{
		name: 'composability: one input yields BOTH a quote and a table (additive, no archetype)',
		fn: async () => {
			const html = '<section><blockquote>"Hi"</blockquote><table><tr><td>x</td></tr></table></section>'
			assert(parseQuote(html) !== null, 'quote should be detected')
			assert(parseTable(html) !== null, 'table should be detected from the same input')
		},
	},
	{
		name: 'no-false-positive: structured extractors return null/[] on plain prose',
		fn: async () => {
			assert(parseTimeline('<p>just text</p>') === null, 'prose → parseTimeline null')
			assert(parseQuote('<p>just text</p>') === null, 'prose → parseQuote null')
			assert(parseBadges('<p>x</p>').length === 0, 'prose → parseBadges []')
			assert(parseCallout('<p>x</p>') === null, 'prose → parseCallout null')
		},
	},
	{
		name: 'parseTimeline: <time datetime> as marker source (heuristic, German locale)',
		fn: async () => {
			const fs = require('fs')
			const html = fs.readFileSync(require('path').resolve(__dirname, 'fixtures/foreign/timeline-datetime.html'), 'utf8')
			const tl = parseTimeline(html)
			assert(tl !== null, 'expected TimelineRow[], got null')
			assert(tl.length === 2, 'expected 2 rows; got: ' + tl.length)
			assert(tl[0].marker === '09:00', "row0 marker from datetime attr; got: " + tl[0].marker)
			assert(tl[1].marker === '10:30', "row1 marker from datetime attr; got: " + tl[1].marker)
			assert(/Registrierung/.test(tl[0].body), 'row0 body; got: ' + tl[0].body)
			assert(/Keynote/.test(tl[1].body), 'row1 body; got: ' + tl[1].body)
		},
	},
	{
		name: 'parseTimeline: container-swallow dedup prefers innermost (no duplicates)',
		fn: async () => {
			// A container wraps items and its text starts with the same time token — must NOT swallow children
			const html = '<div><div><time datetime="09:00">9:00</time> Morning</div><div><time datetime="10:00">10:00</time> Noon</div></div>'
			const tl = parseTimeline(html)
			assert(tl !== null, 'expected rows')
			assert(tl.length === 2, 'container-swallow must not duplicate; got: ' + tl.length)
		},
	},
	{
		name: 'parseTimeline: explicit path with <time datetime> + body separator',
		fn: async () => {
			const html = '<div class="timeline"><div class="timeline-item"><time datetime="14:00">2 PM</time><span>Workshop</span><span>Room B</span></div></div>'
			const tl = parseTimeline(html)
			assert(tl !== null, 'expected rows')
			assert(tl[0].marker === '14:00', 'marker from datetime; got: ' + tl[0].marker)
			assert(tl[0].body.includes('Workshop'), 'body has Workshop; got: ' + tl[0].body)
			assert(tl[0].body.includes('Room B'), 'body has Room B; got: ' + tl[0].body)
			assert(tl[0].body.includes('\u2014'), 'body uses separator; got: ' + tl[0].body)
		},
	},
	// ─── parseTable: colspan + rowspan (Slice 5) ───────────────────────────
	{
		name: 'parseTable: colspan attribute preserved on cells',
		fn: async () => {
			const { readFileSync } = await import('fs')
			const html = readFileSync('test/fixtures/foreign/table-colspan.html', 'utf8')
			const t = parseTable(html)
			assert(t !== null, 'table detected')
			// Row 0: "Name" colspan=2, "Age", "Notes" rowspan=2 — 3 physical cells
			const hdr = t.rows[0]
			assert(hdr[0].text === 'Name', 'first header is Name; got: ' + hdr[0].text)
			assert(hdr[0].colspan === 2, 'Name has colspan=2; got: ' + hdr[0].colspan)
			assert(hdr[0].isHeader === true, 'Name is header')
			assert(hdr[1].text === 'Age', 'second header is Age; got: ' + hdr[1].text)
			assert(hdr[1].colspan === undefined, 'Age has no colspan')
			assert(hdr[2].text === 'Notes', 'third header is Notes; got: ' + hdr[2].text)
			assert(hdr[2].rowspan === 2, 'Notes has rowspan=2; got: ' + hdr[2].rowspan)
		},
	},
	{
		name: 'parseTable: logical column alignment — header spans cover body cells',
		fn: async () => {
			const { readFileSync } = await import('fs')
			const html = readFileSync('test/fixtures/foreign/table-colspan.html', 'utf8')
			const t = parseTable(html)
			assert(t !== null, 'table detected')
			// Header row 0: Name(colspan=2) + Age(1) + Notes(1) = 4 logical columns
			const hdr = t.rows[0]
			const logicalCols = hdr.reduce((n, c) => n + (c.colspan || 1), 0)
			assert(logicalCols === 4, 'header spans 4 logical columns; got: ' + logicalCols)
			// Body rows (index 2,3) have 4 physical cells each
			const body = t.rows[2]
			assert(body.length === 4, 'body row has 4 cells; got: ' + body.length)
			assert(body[0].text === 'Alice', 'first body cell; got: ' + body[0].text)
		},
	},
]
