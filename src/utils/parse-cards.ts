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
import { detectIcon, extractCssCodepoints } from './icon-classify'
import type { GradientFillProps } from '../core-interfaces'
// Shared, dependency-free HTML tree-builder + helpers (promoted out of this file — see
// docs/feature-html-tree-query.md). `parseHtml` is the same parser previously named `buildTree`.
import { parseHtml as buildTree, elements, textOf, classMatch, isAncestorOrSelf } from './html-dom'
import type { HNode } from './html-dom'
// Shared, dependency-free CSS colour-resolution context (promoted out of this file — see
// docs/feature-html-content-extractors.md). `parseCards` behaviour is unchanged: it uses the
// identical colour logic, now shared with the HTML content extractors.
import { extractHex, parseStyleSheets, cssProp, bgOfCtx, colorOf } from './css-context'
import type { HexColor, CssContext } from './css-context'

/** A single parsed card, shaped to spread straight into `slide.addCard()` v2. */
export interface CardData {
	/** Card icon — an inline SVG (multi-path), a Font-Awesome glyph, or a leading emoji. */
	icon?:
		| { type: 'svg', parts: SvgPart[] }
		| {
			type: 'fontIcon'
			/** Resolved glyph codepoint as a string, or `''` when only the class is known. */
			char: string
			/** PowerPoint font family to render the glyph with. */
			fontFace: string
			/** NEW: glyph token without the family prefix, e.g. `'users'` for `fa-users`. */
			glyphName?: string
			/** NEW: the icon element's full class string, e.g. `'fas fa-users'`. */
			className?: string
			/** NEW: detected icon-font family key: `'fa' | 'bi' | 'ph' | 'ion' | 'material' | string`. */
			fontFamily?: string
		}
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
	/**
	 * Optional SYNCHRONOUS resolver from an icon-element class string to vector parts. When it
	 * returns a non-empty array for a card's font-icon, `parseCards` emits `{ type: 'svg', parts }`
	 * instead of `{ type: 'fontIcon', … }`, so the card renders as a crisp custGeom vector with no
	 * icon font installed. Returning `null`/`[]` falls back to the (glyph-aware) `fontIcon`
	 * descriptor. Must be sync — `parseCards` stays synchronous.
	 */
	iconResolver?: (className: string, fontFamily: string, glyphName: string) => SvgPart[] | null
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

// ──────────────────────────────────────────────────────────────────────────────────────────
// HTML tree node + tiny dependency-free tree builder + tree helpers
// ──────────────────────────────────────────────────────────────────────────────────────────
// `HNode`, `parseHtml`(↦ local alias `buildTree`), `elements`, `textOf`, `classMatch`,
// `isAncestorOrSelf`, and `parseStyle` now live in `./html-dom` (imported at the top of this
// file). They are shared with the public `parseHtml`/`query` selector engine. `parseCards`
// behaviour is unchanged — it uses the identical parser, now in one place.

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

/**
 * Pick the PowerPoint font family for a detected icon family + class tokens. Font Awesome resolves
 * to one of its three installed families (Solid / Regular / Brands); anything else falls back to the
 * generic FA Free family (in practice only FA icons reach the font-icon branch of `parseCards`).
 */
function fontFaceFor (family: string, classes: string[]): string {
	if (family === 'fa') {
		if (classes.some(c => c === 'fab' || c === 'fa-brands')) return 'Font Awesome 6 Brands'
		if (classes.some(c => c === 'far' || c === 'fa-regular')) return 'Font Awesome 6 Free Regular'
		return 'Font Awesome 6 Free Solid'
	}
	return 'Font Awesome 6 Free'
}

/** First class of `classes` that has a `::before` codepoint in `cssCodepoints`, as a glyph char. */
function codepointFor (classes: string[], cssCodepoints: Record<string, string>): string {
	for (const c of classes) {
		const cp = cssCodepoints[c]
		if (!cp) continue
		const hex = cp.replace(/[^0-9a-fA-F]/g, '')
		if (!hex) continue
		const n = parseInt(hex, 16)
		if (isFinite(n) && n > 0) {
			try { return String.fromCodePoint(n) } catch (_) { /* invalid codepoint → skip */ }
		}
	}
	return ''
}

/** Pull inline `<style>…</style>` block bodies out of an HTML string (for codepoint extraction). */
function inlineStyleBlocks (html: string): string[] {
	const blocks: string[] = []
	const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
	let m: RegExpExecArray | null
	while ((m = re.exec(html)) !== null) blocks.push(m[1])
	return blocks
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
function analyzeCard (card: HNode, opts: ParseCardsOptions, ctx: CssContext, cssCodepoints: Record<string, string>): CardData {
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
			const desc = detectIcon(faEl.classes.join(' '), textOf(faEl))
			// `faEl` matched `isFaClass`, so `detectIcon` always returns a descriptor; guard anyway.
			const className = desc ? desc.className : faEl.classes.join(' ')
			const fontFamily = desc ? desc.fontFamily : 'fa'
			const glyphName = desc ? desc.glyphName : ''
			const parts = opts.iconResolver ? opts.iconResolver(className, fontFamily, glyphName) : null
			if (parts && parts.length) {
				icon = { type: 'svg', parts }
			} else {
				icon = {
					type: 'fontIcon',
					char: codepointFor(faEl.classes, cssCodepoints),
					fontFace: fontFaceFor(fontFamily, faEl.classes),
					glyphName,
					className,
					fontFamily,
				}
			}
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
	// Class → `::before` codepoint map from inline `<style>` blocks (populates `fontIcon.char`).
	const cssCodepoints = extractCssCodepoints(inlineStyleBlocks(input))

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

	return cards.map(c => analyzeCard(c, opts, ctx, cssCodepoints))
}

export default parseCards
