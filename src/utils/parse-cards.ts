/**
 * PptxGenJS — Generic Card-Structure parser (docs/feature-parse-card-structure.md)
 *
 * `parseCards()` turns an HTML card-grid (the kind every HTML-to-deck converter has to detect by
 * hand) into a list of `CardData` objects that spread directly into `slide.addCard()` v2. Detection
 * is STRUCTURE-driven, not class-name driven, so it works across framework naming conventions
 * (`cap-item`, `wf-card`, `feature-tile`, …): cards are found by a (configurable) class pattern, or
 * by a grid/flex container, then each card's icon / title / description / badge / colours are read
 * from its internal structure. An inline `<svg>` icon is handed to {@link parseSvg} so a multi-colour
 * logo survives as per-path `SvgPart`s.
 *
 * Pure, DEPENDENCY-FREE parsing — a tiny stack-based HTML tree-builder (no cheerio, no DOM, no
 * third-party library), mirroring `src/utils/parse-svg.ts` / `src/utils/extract-theme.ts`. This is an
 * OPTIONAL utility imported from `@jsamuel1/pptxgenjs/utils`; it emits NO OOXML and touches no core
 * code path.
 *
 * COLOUR SCOPE (this release): colours are resolved from INLINE `style="…"`, from simple class rules
 * in a `<style>` block (`.foo { background; color; border; border-left }`, last-declared wins), and
 * from `var(--name[, fallback])` references against `:root`/`html`/`body` custom properties — in both
 * inline styles and class rules. Precedence is INLINE STYLE > CLASS RULE. Inputs with no `<style>`
 * block and no `var()` produce byte-identical output to inline-only parsing. The only piece still out
 * of scope is the browser COMPUTED-style cascade (specificity ranking, id/descendant/combinator
 * selectors, `@media`), which needs a live DOM and is incompatible with string-input, zero-dependency
 * parsing — it is NOT silently dropped.
 */
import { parseSvg } from './parse-svg'
import type { SvgPart } from './parse-svg'
import type { GradientFillProps } from '../core-interfaces'

/** Hex colour string (6-digit, no leading `#`). */
type HexColor = string

/** A single parsed card, shaped to spread straight into `slide.addCard()` v2. */
export interface CardData {
	/** Card icon — an inline SVG (multi-path), a Font-Awesome glyph, or a leading emoji. */
	icon?:
		| { type: 'svg', parts: SvgPart[] }
		| { type: 'fontIcon', char: string, fontFace: string }
		| { type: 'emoji', text: string }
	/** Card title (always present; `''` when none could be detected). */
	title: string
	/** Card description / body text. */
	description?: string
	/** Small pill/count badge: `color` is the badge FILL colour. */
	badge?: { text: string, color: HexColor }
	/** Thin left-edge accent bar (from a `border-left` rule). `width` is in source px. */
	accentBar?: { color: HexColor | GradientFillProps, width: number }
	/** Colours read from inline styles. All hex values are 6-digit, no `#`. */
	colors: {
		iconColor?: HexColor
		tileFill?: HexColor | GradientFillProps
		cardFill?: HexColor | GradientFillProps
		borderColor?: HexColor
		titleColor?: HexColor
		descColor?: HexColor
	}
	/** Back-reference to the internal source node (advanced callers). */
	_el?: unknown
}

/** Options for {@link parseCards}. */
export interface ParseCardsOptions {
	/** Class pattern (tested per class token) marking a grid CONTAINER. @default /(?:^|-)grid\b/ */
	containerPattern?: RegExp
	/** Class pattern (tested per class token) marking a CARD. @default /(?:^|-)(card|item|tile|cell)\b/ */
	cardPattern?: RegExp
	/** Class pattern; elements within a matching region are skipped (mockups/flows). */
	excludeWithin?: RegExp
	/** Fallback fill (6-hex, no `#`) handed to `parseSvg` for unpainted icon elements. */
	defaultFill?: string
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Pattern defaults — tested against EACH class token, so a bare `card`/`grid` matches as well as
// `feature-card`/`cap-grid` (the `(?:^|-)` prefix). These cover every framework naming style in
// the spec's test cases.
// ──────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_CARD = /(?:^|-)(card|item|tile|cell)\b/
const DEFAULT_CONTAINER = /(?:^|-)grid\b/
const DEFAULT_EXCLUDE = /(?:^|-)(anim-right|product-anim|flow|feed-item)\b/
const TITLE_PAT = /(?:^|-)(title|name|heading|head|label)\b/
const DESC_PAT = /(?:^|-)(desc|text|body|caption|subtitle|sub|detail|blurb)\b/
const BADGE_PAT = /(?:^|-)(badge|pill|tag|count|chip)\b/

/** Void (self-terminating) HTML elements that never push onto the open-element stack. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'])

// ──────────────────────────────────────────────────────────────────────────────────────────
// HTML tree node + tiny dependency-free tree builder
// ──────────────────────────────────────────────────────────────────────────────────────────

interface HNode {
	/** Lowercase tag name; `'#text'` for text nodes; `''` for the synthetic root. */
	tag: string
	attrs: Record<string, string>
	classes: string[]
	style: Record<string, string>
	children: HNode[]
	parent: HNode | null
	/** Raw text (text nodes only). */
	text?: string
	/** Raw outer HTML of an `<svg>…</svg>` subtree (svg nodes only) — fed to parseSvg. */
	raw?: string
}

/** Extract `name="value"` attributes from an element's opening-tag inner string. */
function parseAttrs (attrStr: string): Record<string, string> {
	const out: Record<string, string> = {}
	const re = /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g
	let m: RegExpExecArray | null
	while ((m = re.exec(attrStr)) !== null) {
		out[m[1].toLowerCase()] = m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : (m[5] || ''))
	}
	return out
}

/** Read a CSS-like `style="a:b;c:d"` attribute into a property map (keys lowercased). */
function parseStyle (style: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const decl of (style || '').split(';')) {
		const ix = decl.indexOf(':')
		if (ix > 0) out[decl.slice(0, ix).trim().toLowerCase()] = decl.slice(ix + 1).trim()
	}
	return out
}

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

/** Parse an HTML string into a lightweight element tree (stack-based, error-tolerant). */
function buildTree (html: string): HNode {
	const root: HNode = { tag: '', attrs: {}, classes: [], style: {}, children: [], parent: null }
	const stack: HNode[] = [root]
	const top = (): HNode => stack[stack.length - 1]
	const addChild = (node: HNode): void => { node.parent = top(); top().children.push(node) }
	const addText = (raw: string): void => {
		if (raw.length === 0) return
		addChild({ tag: '#text', attrs: {}, classes: [], style: {}, children: [], parent: null, text: raw })
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
	}
	return root
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Tree helpers
// ──────────────────────────────────────────────────────────────────────────────────────────

/** All element (non-text) descendants of `node`, preorder. */
function elements (node: HNode, out: HNode[] = []): HNode[] {
	for (const c of node.children) {
		if (c.tag === '#text') continue
		out.push(c)
		elements(c, out)
	}
	return out
}

/** Concatenated text of an element and its descendants (`<svg>` contributes nothing). */
function textOf (node: HNode): string {
	if (node.tag === '#text') return node.text || ''
	if (node.tag === 'svg') return ''
	let s = ''
	for (const c of node.children) s += textOf(c)
	return s
}

/** True when any class token of `el` matches `pat`. */
function classMatch (el: HNode, pat: RegExp): boolean {
	return el.classes.some(c => pat.test(c))
}

/** True when `a` is an ancestor of (or equal to) `b`. */
function isAncestorOrSelf (a: HNode, b: HNode | null): boolean {
	let cur: HNode | null = b
	while (cur) { if (cur === a) return true; cur = cur.parent }
	return false
}

/** True when `el` (or an ancestor) matches the exclude pattern. */
function isExcluded (el: HNode, pat: RegExp): boolean {
	let cur: HNode | null = el
	while (cur) { if (cur.classes.length && classMatch(cur, pat)) return true; cur = cur.parent }
	return false
}

/** First descendant element of `root` matching `pred`, preorder, skipping `skip` subtrees. */
function findFirst (root: HNode, pred: (e: HNode) => boolean, skip?: Set<HNode>): HNode | null {
	const stack = [...root.children].reverse().filter(c => c.tag !== '#text')
	while (stack.length) {
		const el = stack.pop() as HNode
		if (skip && skip.has(el)) continue
		if (pred(el)) return el
		const kids = el.children.filter(c => c.tag !== '#text')
		for (let k = kids.length - 1; k >= 0; k--) stack.push(kids[k])
	}
	return null
}

/** Is this class token a Font-Awesome marker (`fa`, `fas`, `far`, `fab`, … or `fa-*`)? */
function isFaClass (tok: string): boolean {
	return /^fa[srlbdt]?$/.test(tok) || /^fa-/.test(tok)
}

/** Extract the first colour in a CSS value as 6-digit hex (no `#`); handles `#rgb`/`#rrggbb`/`rgb()`. */
function extractHex (v: string | undefined): string | undefined {
	if (!v) return undefined
	const hm = v.match(/#([0-9a-fA-F]{3,8})\b/)
	if (hm) {
		let h = hm[1]
		if (h.length === 3) h = h.split('').map(c => c + c).join('')
		return h.slice(0, 6).toUpperCase()
	}
	const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
	if (rgb) {
		const to2 = (s: string): string => Math.max(0, Math.min(255, parseInt(s, 10))).toString(16).padStart(2, '0')
		return (to2(rgb[1]) + to2(rgb[2]) + to2(rgb[3])).toUpperCase()
	}
	return undefined
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// CSS cascade-lite: `<style>` block class rules + `:root`/`html`/`body` `var()` custom properties.
// String-input + dependency-free. Out of scope: id/descendant/combinator selectors, specificity
// ranking, `@media`, browser COMPUTED styles (needs a live DOM).
// ──────────────────────────────────────────────────────────────────────────────────────────

/** A simple single-element class rule from a `<style>` block. */
interface ClassRule { classes: string[], decls: Record<string, string> }

/** Parsed stylesheet context threaded through card analysis. Empty ⇒ inline-only (legacy) behaviour. */
interface CssContext { rootVars: Record<string, string>, classRules: ClassRule[] }

/** Empty context — yields byte-identical output to inline-only parsing. */
const EMPTY_CSS: CssContext = { rootVars: {}, classRules: [] }

/** Resolve `var(--name[, fallback])` references against `rootVars`; left as-is when unresolved. */
function resolveVars (value: string | undefined, rootVars: Record<string, string>): string | undefined {
	if (!value || value.indexOf('var(') === -1) return value
	let prev = ''
	let cur = value
	let guard = 0
	while (cur !== prev && guard++ < 10) {
		prev = cur
		cur = cur.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (m, name, fb) => {
			const v = rootVars[name]
			if (v !== undefined) return v
			if (fb !== undefined) return fb.trim()
			return m
		})
	}
	return cur
}

/** Parse all `<style>…</style>` blocks of the input into `:root` vars + simple class rules. */
function parseStyleSheets (html: string): CssContext {
	const rootVars: Record<string, string> = {}
	const classRules: ClassRule[] = []
	let css = ''
	const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
	let sm: RegExpExecArray | null
	while ((sm = styleRe.exec(html)) !== null) css += sm[1] + '\n'
	if (!css) return EMPTY_CSS
	css = css.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
	const ruleRe = /([^{}]+)\{([^{}]*)\}/g
	let rm: RegExpExecArray | null
	while ((rm = ruleRe.exec(css)) !== null) {
		const decls = parseStyle(rm[2])
		for (const sel of rm[1].split(',')) {
			const s = sel.trim()
			if (!s) continue
			if (/^(?::root|html|body)$/i.test(s)) {
				for (const k of Object.keys(decls)) if (k.startsWith('--')) rootVars[k] = decls[k]
			} else if (/^(?:\.[-\w]+)+$/.test(s)) {
				// simple class selector only (`.a` or chained `.a.b`); no element/id/combinator/pseudo
				classRules.push({ classes: s.split('.').filter(Boolean), decls })
			}
		}
	}
	return { rootVars, classRules }
}

/** Merged declarations of all class rules matching `el` (every selector class present); later wins. */
function classDecls (el: HNode, ctx: CssContext): Record<string, string> {
	if (ctx.classRules.length === 0 || el.classes.length === 0) return {}
	const out: Record<string, string> = {}
	for (const rule of ctx.classRules) {
		if (rule.classes.every(c => el.classes.includes(c))) Object.assign(out, rule.decls)
	}
	return out
}

/** Resolved CSS property for `el`: INLINE style (var-resolved) wins, else matched CLASS RULE. */
function cssProp (el: HNode, prop: string, ctx: CssContext): string | undefined {
	const inline = resolveVars(el.style[prop], ctx.rootVars)
	if (inline !== undefined && inline !== '') return inline
	return resolveVars(classDecls(el, ctx)[prop], ctx.rootVars)
}

/** Background colour of `el` honouring the cascade (inline > class rule, with `var()` resolved). */
function bgOfCtx (el: HNode, ctx: CssContext): string | undefined {
	return extractHex(cssProp(el, 'background', ctx)) || extractHex(cssProp(el, 'background-color', ctx))
}

/** Colour of a single CSS property of `el` honouring the cascade (inline > class rule). */
function colorOf (el: HNode, prop: string, ctx: CssContext): string | undefined {
	return extractHex(cssProp(el, prop, ctx))
}

/** Leading emoji (pictographic) cluster at the start of a string, if any. */
function leadingEmoji (text: string): string | undefined {
	const t = text.trim()
	if (!t) return undefined
	// Match a leading emoji / pictographic / symbol code point (incl. surrogate pairs + VS16/ZWJ runs).
	const m = t.match(/^(?:\p{Extended_Pictographic}(?:\u200D|\uFE0F)?)+/u)
	return m ? m[0] : undefined
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Per-card structure analysis
// ──────────────────────────────────────────────────────────────────────────────────────────

/** Ordered "text blocks" of a card: leaf-most text-bearing elements, skipping `skip` subtrees + `<svg>`. */
function textBlocks (card: HNode, skip: Set<HNode>): Array<{ el: HNode, text: string }> {
	const out: Array<{ el: HNode, text: string }> = []
	const walk = (el: HNode): void => {
		if (skip.has(el) || el.tag === 'svg') return
		const childEls = el.children.filter(c => c.tag !== '#text' && !skip.has(c) && c.tag !== 'svg')
		const childWithText = childEls.filter(c => textOf(c).trim().length > 0)
		if (childWithText.length === 0) {
			const t = textOf(el).trim()
			if (t) out.push({ el, text: t })
		} else {
			for (const c of childWithText) walk(c)
		}
	}
	for (const c of card.children) { if (c.tag !== '#text') walk(c) }
	return out
}

/** Build a `CardData` from a single card element. */
function analyzeCard (card: HNode, opts: ParseCardsOptions, ctx: CssContext): CardData {
	const skip = new Set<HNode>()

	// ── icon ──────────────────────────────────────────────────────────────────────────────
	let icon: CardData['icon']
	let iconEl: HNode | null = null
	const svgEl = findFirst(card, e => e.tag === 'svg')
	if (svgEl) {
		iconEl = svgEl
		skip.add(svgEl)
		const parts = parseSvg(svgEl.raw || '', opts.defaultFill ? { defaultFill: opts.defaultFill } : {})
		icon = { type: 'svg', parts }
	} else {
		const faEl = findFirst(card, e => (e.tag === 'i' || e.tag === 'span') && e.classes.some(isFaClass))
		if (faEl) {
			iconEl = faEl
			skip.add(faEl)
			icon = { type: 'fontIcon', char: '', fontFace: 'Font Awesome 6 Free' }
		}
	}

	// ── badge ─────────────────────────────────────────────────────────────────────────────
	let badge: CardData['badge']
	const badgeEl = findFirst(card, e => classMatch(e, BADGE_PAT) && textOf(e).trim().length > 0 && textOf(e).trim().length <= 24, skip)
	if (badgeEl) {
		skip.add(badgeEl)
		const bt = textOf(badgeEl).trim()
		const bc = bgOfCtx(badgeEl, ctx)
		badge = { text: bt, color: bc || '' }
	}

	// ── title ─────────────────────────────────────────────────────────────────────────────
	const titleEl = findByTitle(card, skip)
	let title = ''
	if (titleEl) title = textOf(titleEl).trim()
	else {
		const heading = findFirst(card, e => /^(h[1-4]|strong|b)$/.test(e.tag), skip)
		if (heading) title = textOf(heading).trim()
	}

	// ── description ───────────────────────────────────────────────────────────────────────
	let description: string | undefined
	let descEl: HNode | null = findFirst(card, e => classMatch(e, DESC_PAT) && textOf(e).trim().length > 0, skip)
	const blocks = textBlocks(card, skip)
	if (!title && blocks.length) { title = blocks[0].text }
	if (descEl) {
		description = textOf(descEl).trim() || undefined
	} else {
		const cand = blocks.find(b => b.text !== title && !(titleEl && isAncestorOrSelf(titleEl, b.el)))
		if (cand) { description = cand.text; descEl = cand.el }
	}

	// ── emoji icon fallback (no svg/fontIcon) ───────────────────────────────────────────────
	if (!icon) {
		const lead = leadingEmoji(title)
		if (lead) { icon = { type: 'emoji', text: lead } } else {
			const firstBlock = blocks[0]
			const le = firstBlock ? leadingEmoji(firstBlock.text) : undefined
			if (le) icon = { type: 'emoji', text: le }
		}
	}

	// ── colours (inline style > `<style>` class rule, with `var()` resolved against `:root`) ──
	const colors: CardData['colors'] = {}
	const cardFill = bgOfCtx(card, ctx)
	if (cardFill) colors.cardFill = cardFill
	const borderColor = colorOf(card, 'border', ctx) || colorOf(card, 'border-color', ctx)
	if (borderColor) colors.borderColor = borderColor
	if (titleEl) { const c = colorOf(titleEl, 'color', ctx); if (c) colors.titleColor = c }
	if (descEl) { const c = colorOf(descEl, 'color', ctx); if (c) colors.descColor = c }
	if (iconEl) {
		const ic = colorOf(iconEl, 'color', ctx) || extractHex(iconEl.attrs.color) || extractHex(iconEl.attrs.stroke) || extractHex(iconEl.attrs.fill)
		if (ic) colors.iconColor = ic
		if (iconEl.parent && iconEl.parent !== card) { const tf = bgOfCtx(iconEl.parent, ctx); if (tf) colors.tileFill = tf }
	}

	// ── accent bar (border-left rule) ───────────────────────────────────────────────────────
	let accentBar: CardData['accentBar']
	const bl = cssProp(card, 'border-left', ctx)
	if (bl) {
		const c = extractHex(bl)
		const w = parseFloat(bl)
		if (c) accentBar = { color: c, width: isFinite(w) ? w : 4 }
	}

	const out: CardData = { title, colors }
	if (icon) out.icon = icon
	if (description !== undefined) out.description = description
	if (badge) out.badge = badge
	if (accentBar) out.accentBar = accentBar
	out._el = card
	return out
}

/** Title element: a `*-title|name|heading|head|label` class, skipping `skip` subtrees. */
function findByTitle (card: HNode, skip: Set<HNode>): HNode | null {
	return findFirst(card, e => classMatch(e, TITLE_PAT) && textOf(e).trim().length > 0, skip)
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// parseCards — the public entry
// ──────────────────────────────────────────────────────────────────────────────────────────

/** Locate a grid/flex container whose repeated children are the cards. */
function findContainer (allEls: HNode[], contPat: RegExp, exclPat: RegExp): HNode | null {
	for (const e of allEls) {
		if (isExcluded(e, exclPat)) continue
		const childEls = e.children.filter(c => c.tag !== '#text')
		if (childEls.length < 2) continue
		if (classMatch(e, contPat)) return e
		const disp = e.style.display
		if ((disp === 'grid' || e.style['grid-template-columns'] !== undefined) && childEls.length >= 2) return e
		if (disp === 'flex' && childEls.length >= 3) return e
	}
	return null
}

/**
 * Parse an HTML card-grid into `CardData[]` ready to spread into `slide.addCard()`.
 *
 * @param input - a raw HTML string (Node). A live DOM node is not handled in this release.
 * @param opts - detection patterns + `defaultFill`
 * @returns one `CardData` per detected card (empty array when no grid of ≥2 cards is found)
 */
export function parseCards (input: string, opts: ParseCardsOptions = {}): CardData[] {
	if (typeof input !== 'string' || input.length === 0) return []
	const cardPat = opts.cardPattern || DEFAULT_CARD
	const contPat = opts.containerPattern || DEFAULT_CONTAINER
	const exclPat = opts.excludeWithin || DEFAULT_EXCLUDE

	const root = buildTree(input)
	const allEls = elements(root)
	// Cascade-lite context: `<style>` class rules + `:root` `var()`s. Empty ⇒ inline-only (legacy).
	const ctx = parseStyleSheets(input)

	// 1) cards by class pattern → keep only outermost matches
	const matched = allEls.filter(e => classMatch(e, cardPat) && !isExcluded(e, exclPat))
	const outer = matched.filter(e => !matched.some(o => o !== e && isAncestorOrSelf(o, e.parent)))

	let cards: HNode[] = []
	if (outer.length >= 2) {
		cards = outer
	} else {
		// 2) else a grid/flex container's repeated children are the cards
		const cont = findContainer(allEls, contPat, exclPat)
		if (cont) cards = cont.children.filter(c => c.tag !== '#text')
	}

	// clamp-don't-crash: a lone card (or none) is not a grid → empty result
	if (cards.length < 2) return []

	return cards.map(c => analyzeCard(c, opts, ctx))
}

export default parseCards
