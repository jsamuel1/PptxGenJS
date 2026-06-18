/**
 * PptxGenJS — shared, dependency-free HTML tree-builder + a bounded selector engine
 * (docs/features/feature-html-tree-query.md).
 *
 * This module promotes the private, stack-based HTML tree-builder that already backs
 * `parseCards()` / `parseSvg()` / `extractThemeFromCSS()` into a shared, exported surface, and
 * layers a small **bounded** CSS-selector engine on top (`query`/`queryOne`/`closest`/`matches`).
 * It is a pure string → node-tree → query helper: no cheerio, no DOM, no browser, no OOXML.
 *
 * PARSING is tolerant — `parseHtml` never throws on malformed/unclosed HTML. QUERYING is strict —
 * the selector grammar is a documented, finite subset (universal/type/class/id/attribute-present/
 * attribute-exact/attribute-substring, plus compound/descendant/child combinators and selector
 * lists). Anything outside that grammar throws a clear `unsupported selector` error rather than
 * silently returning a wrong answer (a consumer needing the full cascade still needs a live DOM).
 */

// ──────────────────────────────────────────────────────────────────────────────────────────
// HTML tree node
// ──────────────────────────────────────────────────────────────────────────────────────────

/** A lightweight HTML element/text node produced by {@link parseHtml}. */
export interface HNode {
	/** Lowercase tag name; `'#text'` for text nodes; `''` for the synthetic root. */
	tag: string
	/** Attributes (keys lowercased). */
	attrs: Record<string, string>
	/** Class tokens (from the `class` attribute). */
	classes: string[]
	/** Parsed inline `style="…"` declarations (keys lowercased). */
	style: Record<string, string>
	/** Child nodes (elements and `#text`), in document order. */
	children: HNode[]
	/** Parent node, or `null` for the synthetic root. */
	parent: HNode | null
	/** Raw text (text nodes only). */
	text?: string
	/** Verbatim outer markup of an `<svg>…</svg>` subtree (svg nodes only) — fed to `parseSvg`. */
	raw?: string
}

/** Void (self-terminating) HTML elements that never push onto the open-element stack. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

/**
 * Raw-text / RCDATA elements whose content is NOT parsed as markup: once opened, the lexer scans
 * forward to the literal case-insensitive `</tag>` and emits everything between as one `#text`
 * child, so a `<` inside (`if(a<b)`, `<div>` in a textarea) is never mis-tokenized as a start tag.
 */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'textarea', 'title'])

/**
 * The verbatim subset of {@link RAW_TEXT_TAGS}: `script`/`style` content is CSS/JS source and must
 * survive byte-for-byte (no entity decoding). `textarea`/`title` are RCDATA/escapable-raw-text and
 * are entity-decoded like ordinary text (handled in `parseHtml`'s `addText`).
 */
const VERBATIM_TEXT_TAGS = new Set(['script', 'style'])

// ──────────────────────────────────────────────────────────────────────────────────────────
// Tree builder (stack-based, error-tolerant)
// ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Extract attributes from an element's opening-tag inner string. Captures both `name="value"`
 * forms and valueless boolean attributes (`disabled`, `data-demo`, … → stored as `''`) so that
 * attribute-present selectors (`[data-demo]`) work. Keys are lowercased.
 */
function parseAttrs (attrStr: string): Record<string, string> {
	const out: Record<string, string> = {}
	const re = /([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
	let m: RegExpExecArray | null
	while ((m = re.exec(attrStr)) !== null) {
		const name = m[1].toLowerCase()
		out[name] = m[2] === undefined
			? ''
			: (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] || '')))
	}
	return out
}

/** Read a CSS-like `style="a:b;c:d"` attribute into a property map (keys lowercased). */
export function parseStyle (style: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const decl of (style || '').split(';')) {
		const ix = decl.indexOf(':')
		if (ix > 0) out[decl.slice(0, ix).trim().toLowerCase()] = decl.slice(ix + 1).trim()
	}
	return out
}
/**
 * Bounded subset (~250) of HTML named character references commonly encountered in web content.
 * Covers: XML core, Latin-1 Supplement, General Punctuation, Common Symbols, Math Operators,
 * Greek alphabet (upper + lower), and Miscellaneous entities. Case-sensitive per spec.
 */
const NAMED_ENTITIES: Record<string, string> = {
	// XML core (original 6)
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
	// Latin-1 Supplement
	iexcl: '¡', cent: '¢', pound: '£', curren: '¤', yen: '¥',
	brvbar: '¦', sect: '§', uml: '¨', copy: '©', ordf: 'ª',
	laquo: '«', not: '¬', shy: '­', reg: '®', macr: '¯',
	deg: '°', plusmn: '±', sup2: '²', sup3: '³', acute: '´',
	micro: 'µ', para: '¶', middot: '·', cedil: '¸', sup1: '¹',
	ordm: 'º', raquo: '»', frac14: '¼', frac12: '½', frac34: '¾',
	iquest: '¿',
	Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä',
	Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç', Egrave: 'È', Eacute: 'É',
	Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î',
	Iuml: 'Ï', ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó',
	Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', times: '×', Oslash: 'Ø',
	Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
	THORN: 'Þ', szlig: 'ß',
	agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä',
	aring: 'å', aelig: 'æ', ccedil: 'ç', egrave: 'è', eacute: 'é',
	ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î',
	iuml: 'ï', eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó',
	ocirc: 'ô', otilde: 'õ', ouml: 'ö', divide: '÷', oslash: 'ø',
	ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý',
	thorn: 'þ', yuml: 'ÿ',
	// General Punctuation
	ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚',
	ldquo: '“', rdquo: '”', bdquo: '„', dagger: '†', Dagger: '‡',
	bull: '•', hellip: '…', permil: '‰', prime: '′', Prime: '″',
	lsaquo: '‹', rsaquo: '›', oline: '‾', frasl: '⁄', euro: '€',
	// Common Symbols
	trade: '™', larr: '←', uarr: '↑', rarr: '→', darr: '↓',
	harr: '↔', loz: '◊', spades: '♠', clubs: '♣', hearts: '♥',
	diams: '♦',
	// Math Operators
	forall: '∀', part: '∂', exist: '∃', empty: '∅', nabla: '∇',
	isin: '∈', notin: '∉', ni: '∋', prod: '∏', sum: '∑',
	minus: '−', lowast: '∗', radic: '√', prop: '∝', infin: '∞',
	ang: '∠', and: '∧', or: '∨', cap: '∩', cup: '∪',
	int: '∫', there4: '∴', sim: '∼', cong: '≅', asymp: '≈',
	ne: '≠', equiv: '≡', le: '≤', ge: '≥', sub: '⊂',
	sup: '⊃', nsub: '⊄', sube: '⊆', supe: '⊇', oplus: '⊕',
	otimes: '⊗', perp: '⊥', sdot: '⋅',
	// Greek (uppercase)
	Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε',
	Zeta: 'Ζ', Eta: 'Η', Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ',
	Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ', Omicron: 'Ο',
	Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ',
	Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
	// Greek (lowercase)
	alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε',
	zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ',
	lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
	pi: 'π', rho: 'ρ', sigmaf: 'ς', sigma: 'σ', tau: 'τ',
	upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
	// Miscellaneous
	OElig: 'Œ', oelig: 'œ', Scaron: 'Š', scaron: 'š', Yuml: 'Ÿ',
	fnof: 'ƒ', circ: 'ˆ', tilde: '˜', ensp: ' ', emsp: ' ',
	thinsp: ' ', zwnj: '‌', zwj: '‍', lrm: '‎', rlm: '‏',
}

/**
 * Decode the common HTML entities found in text content back to their literal characters, so that
 * a single downstream `encodeXmlEntities` pass produces correct OOXML (`&amp;` → `&` → `&amp;`,
 * not `&amp;amp;`). Covers the standard named entities plus decimal (`&#NN;`) and hex (`&#xHH;`)
 * numeric forms. A single regex pass guarantees each entity is decoded exactly once (so
 * `&amp;lt;` → `&lt;`, never `<`). The `outerHtml`/`esc` serializer re-encodes on output, so the
 * parse→serialize round-trip stays correct.
 */
export function decodeHtmlEntities (s: string): string {
	if (s.indexOf('&') === -1) return s
	return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (match: string, body: string): string => {
		if (body[0] === '#') {
			const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
			return Number.isFinite(code) && code >= 1 && code <= 0x10FFFF ? String.fromCodePoint(code) : match
		}
		const named = NAMED_ENTITIES[body]
		return named !== undefined ? named : match
	})
}
export { decodeHtmlEntities as decodeEntities }

/** Make an element node from a tag name + opening-tag attribute string. */
function makeEl (tag: string, attrStr: string): HNode {
	const attrs = parseAttrs(attrStr)
	const classes = (attrs.class || '').split(/\s+/).filter(Boolean)
	const style = parseStyle(attrs.style || '')
	return { tag: tag.toLowerCase(), attrs, classes, style, children: [], parent: null }
}

/** Find the index of the `>` that closes the tag starting at `lt`, respecting quoted attributes. */
function findTagEnd (html: string, lt: number): number {
	let i = lt + 1
	let q: string | null = null
	const n = html.length
	while (i < n) {
		const c = html[i]
		if (q) { if (c === q) q = null } else if (c === '"' || c === "'") q = c
		else if (c === '>') return i
		i++
	}
	return n
}

/** Capture a full `<svg>…</svg>` subtree as a raw string. Returns `[raw, endIndexExclusive]`. */
function captureSvg (html: string, start: number): [string, number] {
	const n = html.length
	let depth = 0
	let i = start
	while (i < n) {
		const lower = html.slice(i, i + 6).toLowerCase()
		if (lower.startsWith('</svg')) {
			const gt = html.indexOf('>', i)
			const end = gt === -1 ? n : gt + 1
			depth--
			if (depth <= 0) return [html.slice(start, end), end]
			i = end
		} else if (/^<svg[\s>/]/i.test(html.slice(i, i + 5))) {
			const gt = findTagEnd(html, i)
			const selfClose = html[gt - 1] === '/'
			if (selfClose) { if (depth === 0) return [html.slice(start, gt + 1), gt + 1] } else depth++
			i = (gt === -1 ? n : gt + 1)
		} else {
			i++
		}
	}
	return [html.slice(start), n]
}

/**
 * Parse an HTML string into a lightweight element tree (stack-based, error-tolerant). Never throws
 * on malformed or unclosed HTML — unmatched end tags are ignored and unclosed elements are popped
 * tolerantly. `<svg>` subtrees are captured opaque (their outer markup is kept on `node.raw`).
 */
export function parseHtml (html: string): HNode {
	const root: HNode = { tag: '', attrs: {}, classes: [], style: {}, children: [], parent: null }
	if (typeof html !== 'string' || html.length === 0) return root
	const stack: HNode[] = [root]
	const top = (): HNode => stack[stack.length - 1]
	const addChild = (node: HNode): void => { node.parent = top(); top().children.push(node) }
	const addText = (raw: string): void => {
		if (raw.length === 0) return
		// Verbatim raw-text (script/style) keeps its content byte-for-byte; RCDATA/escapable-raw-text
		// (textarea/title) is still scanned to its literal close tag but its content IS entity-decoded.
		const text = VERBATIM_TEXT_TAGS.has(top().tag) ? raw : decodeHtmlEntities(raw)
		addChild({ tag: '#text', attrs: {}, classes: [], style: {}, children: [], parent: null, text })
	}

	let i = 0
	const n = html.length
	while (i < n) {
		const lt = html.indexOf('<', i)
		if (lt === -1) { addText(html.slice(i)); break }
		if (lt > i) addText(html.slice(i, lt))

		// comment
		if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e === -1 ? n : e + 3; continue }
		// doctype / declaration / processing instruction
		if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e === -1 ? n : e + 1; continue }
		// inline <svg> — captured opaque and handed to parseSvg later
		if (/^<svg[\s>/]/i.test(html.slice(lt, lt + 5))) {
			const [raw, end] = captureSvg(html, lt)
			const svgTagM = raw.match(/^<svg\b([^>]*)>/i)
			const svg = makeEl('svg', svgTagM ? svgTagM[1] : '')
			svg.raw = raw
			addChild(svg)
			i = end
			continue
		}
		// end tag
		if (html[lt + 1] === '/') {
			const e = html.indexOf('>', lt)
			const name = html.slice(lt + 2, e === -1 ? n : e).trim().toLowerCase()
			// pop until the matching open tag (tolerant of unclosed elements)
			for (let s = stack.length - 1; s >= 1; s--) {
				if (stack[s].tag === name) { stack.length = s; break }
			}
			i = e === -1 ? n : e + 1
			continue
		}
		// start tag
		const e = findTagEnd(html, lt)
		const inner = html.slice(lt + 1, e)
		const mName = inner.match(/^([\w:-]+)/)
		if (!mName) { i = e + 1; continue }
		const name = mName[1].toLowerCase()
		const attrStr = inner.slice(mName[1].length)
		const selfClose = inner.trimEnd().endsWith('/')
		const node = makeEl(name, attrStr)
		addChild(node)
		if (!selfClose && !VOID_TAGS.has(name)) stack.push(node)
		i = e + 1
		if (RAW_TEXT_TAGS.has(name) && !selfClose) {
			const closeRe = new RegExp('</' + name + '\\s*>', 'i')
			const closeM = closeRe.exec(html.slice(i))
			if (closeM) {
				addText(html.slice(i, i + closeM.index))
				stack.pop()
				i = i + closeM.index + closeM[0].length
			}
			continue
		}
	}
	return root
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Tree helpers
// ──────────────────────────────────────────────────────────────────────────────────────────

/** All element (non-text) descendants of `node`, preorder (document order). */
export function elements (node: HNode, out: HNode[] = []): HNode[] {
	for (const c of node.children) {
		if (c.tag === '#text') continue
		out.push(c)
		elements(c, out)
	}
	return out
}

/** Tags whose content is not user-visible and must be excluded from parent text extraction. */
const INVISIBLE_TAGS = new Set(['svg', 'script', 'style', 'noscript', 'template'])

/** Internal recursive text gatherer. Skips invisible children unless they are the entry node. */
function _textOf (node: HNode, isRoot: boolean): string {
	if (node.tag === '#text') return node.text || ''
	if (!isRoot && INVISIBLE_TAGS.has(node.tag)) return ''
	let s = ''
	for (const c of node.children) s += _textOf(c, false)
	return s
}

/** Regex matching all Private Use Area codepoints (BMP + supplementary planes 15/16). */
const PUA_RE = /[\uE000-\uF8FF]|[\uDB80-\uDBFF][\uDC00-\uDFFF]/g

/** Concatenated text of an element and its descendants (`<svg>` contributes nothing). */
export function textOf (node: HNode, opts?: { keepPUA?: boolean }): string {
	if (typeof node === 'string') throw new Error('textOf: expected HNode from parseHtml(), got a string')
	const raw = _textOf(node, true)
	if (opts?.keepPUA) return raw
	const stripped = raw.replace(PUA_RE, '')
	if (stripped.length === raw.length) return raw // no-op fast path
	return stripped.replace(/\s{2,}/g, ' ').trim()
}

/** Block-level elements that generate line breaks in innerText-style extraction. */
const BLOCK_TAGS = new Set([
	'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr',
	'blockquote', 'section', 'article', 'header', 'footer', 'nav', 'main',
	'aside', 'details', 'summary', 'figcaption', 'figure', 'dd', 'dt',
	'dl', 'ol', 'ul', 'pre', 'hr', 'table', 'thead', 'tbody', 'tfoot',
])

/** Recursive walker that builds innerText-style output with block-boundary newlines. */
function _innerTextOf (node: HNode): string {
	if (node.tag === '#text') return node.text || ''
	if (INVISIBLE_TAGS.has(node.tag)) return ''
	if (node.tag === 'br') return '\n'
	let inner = ''
	for (const c of node.children) inner += _innerTextOf(c)
	if (BLOCK_TAGS.has(node.tag)) return '\n' + inner + '\n'
	return inner
}

/**
 * Browser-like `innerText` extraction: block elements produce line breaks, `<br>` inserts `\n`,
 * invisible tags are skipped, and whitespace runs collapse to a single space.
 */
export function innerTextOf (node: HNode, opts?: { keepPUA?: boolean }): string {
	if (typeof node === 'string') throw new Error('innerTextOf: expected HNode from parseHtml(), got a string')
	let raw = _innerTextOf(node)
	if (!opts?.keepPUA) raw = raw.replace(PUA_RE, '')
	// collapse whitespace: runs of spaces/tabs → single space, preserve explicit \n
	return raw.replace(/[^\S\n]+/g, ' ').replace(/\n{2,}/g, '\n').replace(/\n /g, '\n').replace(/ \n/g, '\n').trim()
}

/** True when any class token of `el` matches `pat`. */
export function classMatch (el: HNode, pat: RegExp): boolean {
	return el.classes.some(c => pat.test(c))
}

/** True when `a` is an ancestor of (or equal to) `b`. */
export function isAncestorOrSelf (a: HNode, b: HNode | null): boolean {
	let cur: HNode | null = b
	while (cur) { if (cur === a) return true; cur = cur.parent }
	return false
}

/** Get an attribute value (case-insensitive name), or `undefined` when absent. */
export function attr (node: HNode, name: string): string | undefined {
	return node.attrs[String(name).toLowerCase()]
}

/** Deep-copy a node (children re-parented to the copy). The result is detached (`parent === null`). */
export function clone (node: HNode): HNode {
	const copy: HNode = {
		tag: node.tag,
		attrs: { ...node.attrs },
		classes: [...node.classes],
		style: { ...node.style },
		children: [],
		parent: null,
	}
	if (node.text !== undefined) copy.text = node.text
	if (node.raw !== undefined) copy.raw = node.raw
	for (const c of node.children) {
		const cc = clone(c)
		cc.parent = copy
		copy.children.push(cc)
	}
	return copy
}

/** Escape a string for use in HTML text/attribute context. */
function esc (s: string, isAttr: boolean): string {
	let out = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
	if (isAttr) out = out.replace(/"/g, '&quot;')
	return out
}

/** Serialize a node back to HTML. Uses `raw` verbatim for captured `<svg>` subtrees. */
export function outerHtml (node: HNode): string {
	if (node.tag === '#text') return esc(node.text || '', false)
	if (node.raw) return node.raw
	const inner = node.children.map(outerHtml).join('')
	// synthetic root: emit children only
	if (node.tag === '') return inner
	const attrStr = Object.keys(node.attrs)
		.map(k => ` ${k}="${esc(node.attrs[k], true)}"`)
		.join('')
	if (VOID_TAGS.has(node.tag)) return `<${node.tag}${attrStr}>`
	return `<${node.tag}${attrStr}>${inner}</${node.tag}>`
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Bounded selector engine
//
// Grammar (the ENTIRE supported subset — anything else throws `unsupported selector`):
//   universal `*` · type `div` · class `.x` · id `#x` · `[attr]` · `[attr="v"]` · `[attr*="v"]`
//   `[attr^="v"]` · `[attr$="v"]` · `[attr~="v"]` (whitespace word/class-membership)
//   · `[attr|="v"]` (dash-match: exact `v` or `v-…`)
//   compound (type+class/attr, no space) · descendant (space) · child (`>`) · adjacent (`+`)
//   · general sibling (`~`) · list (comma)
//   pseudo-classes: `:first-child` · `:last-child` · `:only-child` · `:nth-child(An+B)`
//   (also `even`/`odd`/`n`/bare integer) · `:not(sel)`
// Explicitly unsupported (throws): pseudo-elements (`::before` etc.), namespaces, `@media`,
// specificity.
// ──────────────────────────────────────────────────────────────────────────────────────────

/** A single attribute condition within a compound selector. */
interface AttrCond { name: string, op: 'present' | 'exact' | 'substring' | 'starts' | 'ends' | 'word' | 'dash', value: string }

/** A parsed pseudo-class condition. */
interface Pseudo { name: 'first-child' | 'last-child' | 'only-child' | 'nth-child' | 'not', arg?: string }

/** A compound selector (simple selectors with no combinator between them). */
interface Compound { universal: boolean, type?: string, id?: string, classes: string[], attrs: AttrCond[], pseudos: Pseudo[] }

/** One step of a complex selector: a compound plus the combinator linking it to the previous step. */
interface Segment { combinator: 'descendant' | 'child' | 'adjacent' | 'sibling' | null, compound: Compound }

/** Raise the canonical bounded-grammar error. */
function unsupported (selector: string): never {
	throw new Error(`unsupported selector: ${selector}`)
}

/**
 * Structural type-guard for an {@link HNode}. Used by the node-vs-selector helpers
 * (`query`/`matches`/`closest`) to distinguish a containment/identity argument from a
 * string selector. Discriminates on the HNode shape (a `string` tag + a `children` array)
 * so it can never collide with a string selector.
 */
function isHNode (v: unknown): v is HNode {
	return typeof v === 'object' && v !== null &&
		typeof (v as HNode).tag === 'string' && Array.isArray((v as HNode).children)
}

/** Strip surrounding single/double quotes from an attribute value. */
function unquote (v: string): string {
	const t = v.trim()
	if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
		return t.slice(1, -1)
	}
	return t
}

/** Parse a single `[...]` attribute condition body (the text between the brackets). */
function parseAttrCond (body: string, selector: string): AttrCond {
	const m = body.match(/^\s*([-\w:]+)\s*(?:([*^$~|]?=)\s*(.*?))?\s*$/)
	if (!m) unsupported(selector)
	const name = m[1].toLowerCase()
	if (m[2] === undefined) return { name, op: 'present', value: '' }
	if (m[2] === '=') return { name, op: 'exact', value: unquote(m[3] ?? '') }
	if (m[2] === '*=') return { name, op: 'substring', value: unquote(m[3] ?? '') }
	if (m[2] === '^=') return { name, op: 'starts', value: unquote(m[3] ?? '') }
	if (m[2] === '$=') return { name, op: 'ends', value: unquote(m[3] ?? '') }
	if (m[2] === '~=') return { name, op: 'word', value: unquote(m[3] ?? '') }
	if (m[2] === '|=') return { name, op: 'dash', value: unquote(m[3] ?? '') }
	return unsupported(selector)
}

/** Parse one compound selector token (no combinators inside) into a {@link Compound}. */
function parseCompound (token: string, selector: string): Compound {
	const compound: Compound = { universal: false, classes: [], attrs: [], pseudos: [] }
	let i = 0
	const n = token.length
	if (n === 0) unsupported(selector)

	// optional leading universal or type
	if (token[0] === '*') {
		compound.universal = true
		i = 1
	} else if (/[a-zA-Z]/.test(token[0])) {
		const m = token.slice(i).match(/^[-\w]+/)
		if (!m) unsupported(selector)
		compound.type = m[0].toLowerCase()
		i += m[0].length
	}

	while (i < n) {
		const c = token[i]
		if (c === '.') {
			const m = token.slice(i + 1).match(/^[-\w]+/)
			if (!m) unsupported(selector)
			compound.classes.push(m[0])
			i += 1 + m[0].length
		} else if (c === '#') {
			const m = token.slice(i + 1).match(/^[-\w]+/)
			if (!m) unsupported(selector)
			compound.id = m[0]
			i += 1 + m[0].length
		} else if (c === '[') {
			const close = token.indexOf(']', i + 1)
			if (close === -1) unsupported(selector)
			compound.attrs.push(parseAttrCond(token.slice(i + 1, close), selector))
			i = close + 1
		} else if (c === ':') {
			if (token[i + 1] === ':') unsupported(selector) // pseudo-elements (::before etc.)
			i++ // skip the `:`
			const nameMatch = token.slice(i).match(/^[-\w]+/)
			if (!nameMatch) unsupported(selector)
			const pName = nameMatch[0]
			i += pName.length
			if (pName === 'first-child' || pName === 'last-child' || pName === 'only-child') {
				compound.pseudos.push({ name: pName })
			} else if (pName === 'nth-child' || pName === 'not') {
				if (token[i] !== '(') unsupported(selector)
				const argStart = i + 1; let depth = 1
				i++
				while (i < n && depth > 0) {
					if (token[i] === '(') depth++
					else if (token[i] === ')') depth--
					i++
				}
				if (depth !== 0) unsupported(selector)
				compound.pseudos.push({ name: pName, arg: token.slice(argStart, i - 1).trim() })
			} else {
				unsupported(selector)
			}
		} else {
			unsupported(selector)
		}
	}
	return compound
}

/** Split a selector list on top-level commas (ignoring commas inside `[...]` or quotes). */
function splitList (selector: string): string[] {
	const parts: string[] = []
	let depth = 0
	let q: string | null = null
	let start = 0
	for (let i = 0; i < selector.length; i++) {
		const c = selector[i]
		if (q) { if (c === q) q = null; continue }
		if (c === '"' || c === "'") { q = c; continue }
		if (c === '[') depth++
		else if (c === ']') depth = Math.max(0, depth - 1)
		else if (c === ',' && depth === 0) { parts.push(selector.slice(start, i)); start = i + 1 }
	}
	parts.push(selector.slice(start))
	return parts.map(p => p.trim()).filter(p => p.length > 0)
}

/** Parse one complex selector (combinator-joined compounds) into an ordered {@link Segment} list. */
function parseComplex (selector: string, original: string): Segment[] {
	const segments: Segment[] = []
	let i = 0
	const n = selector.length
	let pendingCombinator: 'descendant' | 'child' | 'adjacent' | 'sibling' | null = null
	let first = true

	while (i < n) {
		// consume whitespace (a descendant combinator unless an explicit `>` overrides it)
		let sawWs = false
		while (i < n && /\s/.test(selector[i])) { sawWs = true; i++ }
		if (i >= n) break
		if (selector[i] === '>') {
			pendingCombinator = 'child'
			i++
			continue
		}
		if (selector[i] === '+') {
			pendingCombinator = 'adjacent'
			i++
			continue
		}
		if (selector[i] === '~') {
			pendingCombinator = 'sibling'
			i++
			continue
		}
		if (sawWs && !first && pendingCombinator === null) pendingCombinator = 'descendant'

		// read a compound token: up to the next top-level whitespace or combinator. `[` and `(`
		// nesting (the latter for pseudo args like `:nth-child(2n+1)` / `:not(a + b)`) is tracked
		// so a `+`/`~`/space INSIDE them is not mistaken for a combinator.
		const start = i
		let depth = 0
		let paren = 0
		let q: string | null = null
		while (i < n) {
			const c = selector[i]
			if (q) { if (c === q) q = null; i++; continue }
			if (c === '"' || c === "'") { q = c; i++; continue }
			if (c === '[') { depth++; i++; continue }
			if (c === ']') { depth = Math.max(0, depth - 1); i++; continue }
			if (c === '(') { paren++; i++; continue }
			if (c === ')') { paren = Math.max(0, paren - 1); i++; continue }
			if (depth === 0 && paren === 0 && (/\s/.test(c) || c === '>' || c === '+' || c === '~')) break
			i++
		}
		const token = selector.slice(start, i)
		if (token.length === 0) unsupported(original)
		segments.push({ combinator: first ? null : pendingCombinator, compound: parseCompound(token, original) })
		pendingCombinator = null
		first = false
	}

	if (segments.length === 0) unsupported(original)
	return segments
}

/** Parse a selector list into one {@link Segment} chain per comma-group. */
function parseSelector (selector: string): Segment[][] {
	if (typeof selector !== 'string') unsupported(String(selector))
	const groups = splitList(selector)
	if (groups.length === 0) unsupported(selector)
	return groups.map(g => parseComplex(g, selector))
}

/**
 * Parse a CSS `:nth-child` argument into its `An+B` coefficients. Accepts `even`, `odd`, a bare
 * integer (`3`), `n`, `An`, `An+B`, `An-B`, `-n+B`, etc. Returns `null` when the argument is not a
 * valid An+B microsyntax (so the caller can match nothing rather than guess).
 */
function parseNthArg (arg: string): { a: number, b: number } | null {
	const s = arg.trim().toLowerCase()
	if (s === 'even') return { a: 2, b: 0 }
	if (s === 'odd') return { a: 2, b: 1 }
	// bare integer: matches exactly the B-th child
	if (/^[+-]?\d+$/.test(s)) return { a: 0, b: parseInt(s, 10) }
	// An+B microsyntax (the `n` term is required here; bare integers handled above)
	const m = s.match(/^([+-]?\d*)n\s*([+-]\s*\d+)?$/)
	if (!m) return null
	const aRaw = m[1]
	const a = aRaw === '' || aRaw === '+' ? 1 : (aRaw === '-' ? -1 : parseInt(aRaw, 10))
	const b = m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0
	return { a, b }
}

/** True when a 1-based index satisfies the `An+B` formula (some non-negative integer `k` exists). */
function nthMatches (a: number, b: number, oneBasedIdx: number): boolean {
	if (a === 0) return oneBasedIdx === b
	const k = (oneBasedIdx - b) / a
	return Number.isInteger(k) && k >= 0
}

/** True when an element node satisfies a single pseudo-class condition. */
function matchPseudo (node: HNode, pseudo: Pseudo): boolean {
	if (!node.parent) return false
	const siblings = node.parent.children.filter(c => c.tag !== '#text')
	const idx = siblings.indexOf(node)
	switch (pseudo.name) {
		case 'first-child': return idx === 0
		case 'last-child': return idx === siblings.length - 1
		case 'only-child': return siblings.length === 1
		case 'nth-child': {
			const nb = parseNthArg(pseudo.arg ?? '')
			if (!nb) return false
			return nthMatches(nb.a, nb.b, idx + 1)
		}
		case 'not': {
			const groups = parseSelector(pseudo.arg ?? '')
			return !groups.some(seg => matchSegments(node, seg, seg.length - 1))
		}
	}
}

/** True when an element node satisfies a single compound selector. (Text/root nodes never match.) */
function matchCompound (node: HNode, c: Compound): boolean {
	if (node.tag === '#text' || node.tag === '') return false
	if (c.type !== undefined && node.tag !== c.type) return false
	for (const cls of c.classes) if (!node.classes.includes(cls)) return false
	if (c.id !== undefined && node.attrs.id !== c.id) return false
	for (const a of c.attrs) {
		const v = node.attrs[a.name]
		if (a.op === 'present') { if (v === undefined) return false }
		else if (a.op === 'exact') { if (v !== a.value) return false }
		else if (a.op === 'substring') { if (v === undefined || v.indexOf(a.value) === -1) return false }
		else if (a.op === 'starts') { if (v === undefined || !v.startsWith(a.value)) return false }
		else if (a.op === 'ends') { if (v === undefined || !v.endsWith(a.value)) return false }
		else if (a.op === 'word') {
			// `[attr~="v"]` — `v` is one of the whitespace-separated words of `attr` (class membership).
			// Per spec an empty/whitespace-containing `v` never matches.
			if (v === undefined || a.value === '' || /\s/.test(a.value)) return false
			if (!v.split(/\s+/).includes(a.value)) return false
		} else if (a.op === 'dash') {
			// `[attr|="v"]` — `attr` equals `v` exactly, or begins with `v` immediately followed by `-`.
			if (v === undefined || (v !== a.value && !v.startsWith(a.value + '-'))) return false
		}
	}
	for (const p of c.pseudos) if (!matchPseudo(node, p)) return false
	return true
}

/** True when `node` matches `segments[0..index]` with `node` as the `segments[index]` target. */
function matchSegments (node: HNode, segments: Segment[], index: number): boolean {
	if (!matchCompound(node, segments[index].compound)) return false
	if (index === 0) return true
	const comb = segments[index].combinator
	if (comb === 'adjacent') {
		if (!node.parent) return false
		const siblings = node.parent.children
		const idx = siblings.indexOf(node)
		for (let j = idx - 1; j >= 0; j--) {
			if (siblings[j].tag !== '#text') return matchSegments(siblings[j], segments, index - 1)
		}
		return false
	}
	if (comb === 'sibling') {
		if (!node.parent) return false
		const siblings = node.parent.children
		const idx = siblings.indexOf(node)
		for (let j = idx - 1; j >= 0; j--) {
			if (siblings[j].tag !== '#text' && matchSegments(siblings[j], segments, index - 1)) return true
		}
		return false
	}
	if (comb === 'child') {
		return node.parent ? matchSegments(node.parent, segments, index - 1) : false
	}
	// descendant: try each ancestor (backtracking)
	let p = node.parent
	while (p) {
		if (matchSegments(p, segments, index - 1)) return true
		p = p.parent
	}
	return false
}

/**
 * True when `node` matches `selector`. With a **string** selector this is the bounded
 * selector grammar (node is the rightmost target). With an **HNode** argument it is an
 * identity test (`node === selector`), mirroring cheerio's `$(node).is(other)`.
 */
export function matches (node: HNode, selector: string | HNode): boolean {
	if (isHNode(selector)) return node === selector
	if (typeof selector !== 'string') throw new TypeError('matches(node, selector): selector must be a string or HNode')
	const groups = parseSelector(selector)
	return groups.some(seg => matchSegments(node, seg, seg.length - 1))
}

/**
 * All descendants of `root` matching `selector`, in document order (like `querySelectorAll`).
 * With an **HNode** argument this is a containment/descendant test (mirroring cheerio's
 * `$(root).find(node)`): returns `[selector]` iff `selector` is a descendant of `root`
 * (not `root` itself), else `[]`.
 */
export function query (root: HNode, selector: string | HNode): HNode[] {
	if (isHNode(selector)) return isAncestorOrSelf(root, selector) && selector !== root ? [selector] : []
	if (typeof selector !== 'string') throw new TypeError('query(root, selector): selector must be a string or HNode')
	const groups = parseSelector(selector)
	const out: HNode[] = []
	for (const el of elements(root)) {
		if (groups.some(seg => matchSegments(el, seg, seg.length - 1))) out.push(el)
	}
	return out
}

/** First descendant of `root` matching a **string** `selector`, or `null` (like `querySelector`). */
export function queryOne (root: HNode, selector: string): HNode | null {
	if (typeof selector !== 'string') throw new TypeError('queryOne(root, selector): selector must be a string')
	const groups = parseSelector(selector)
	for (const el of elements(root)) {
		if (groups.some(seg => matchSegments(el, seg, seg.length - 1))) return el
	}
	return null
}

/**
 * Nearest ancestor-or-self of `node` matching `selector`, or `null` (like `Element.closest`).
 * With an **HNode** argument this is an ancestor-or-self identity test (mirroring cheerio's
 * `$(node).closest(other)`): returns `selector` iff `selector === node` or `selector` is an
 * ancestor of `node`, else `null`.
 */
export function closest (node: HNode, selector: string | HNode): HNode | null {
	if (isHNode(selector)) return isAncestorOrSelf(selector, node) ? selector : null
	if (typeof selector !== 'string') throw new TypeError('closest(node, selector): selector must be a string or HNode')
	const groups = parseSelector(selector)
	let cur: HNode | null = node
	while (cur && cur.tag !== '') {
		if (groups.some(seg => matchSegments(cur as HNode, seg, seg.length - 1))) return cur
		cur = cur.parent
	}
	return null
}
