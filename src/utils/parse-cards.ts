/**
 * PptxGenJS — Generic Card-Structure parser (docs/features/feature-parse-card-structure.md)
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
import { ICON_FAMILIES, MATERIAL_FONT_FACE_FAMILIES, ICON_FONT_FACES } from './icon-fonts.constants'
import type { GradientFillProps } from '../core-interfaces'
// Shared, dependency-free HTML tree-builder + helpers (promoted out of this file — see
// docs/features/feature-html-tree-query.md). `parseHtml` is the same parser previously named `buildTree`.
import { parseHtml as buildTree, elements, textOf, classMatch, isAncestorOrSelf } from './html-dom'
import type { HNode } from './html-dom'
// Shared, dependency-free CSS colour-resolution context (promoted out of this file — see
// docs/features/feature-html-content-extractors.md). `parseCards` behaviour is unchanged: it uses the
// identical colour logic, now shared with the HTML content extractors.
import { extractHex, parseStyleSheets, cssProp, bgOfCtx, colorOf, transparencyOf } from './css-context'
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
		/** Border transparency (percent, 0–100) from an `rgba()`/`#rrggbbaa` border colour. Omitted when opaque. */
		borderTransparency?: number
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
	/** Class pattern identifying TITLE elements within a card. @default /(?:^|-)(title|name|heading|head|label)$/ */
	titlePattern?: RegExp
	/** Class pattern identifying DESCRIPTION elements within a card. @default /(?:^|-)(desc|text|body|caption|subtitle|sub|detail|blurb)$/ */
	descPattern?: RegExp
	/** Class pattern identifying BADGE elements within a card. @default /(?:^|-)(badge|pill|tag|count|chip)$/i */
	badgePattern?: RegExp
	/** Class pattern for elements that must NEVER be adopted as sibling cards. @default /(^|-)(quote|callout|testimonial|blockquote)\b/ */
	neverAdoptPattern?: RegExp
	/** Max character length for title-likeness heuristic in sibling adoption. @default 60 */
	titleMaxChars?: number
	/** Max character length for badge text. @default 24 */
	badgeMaxChars?: number
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Pattern defaults — tested against EACH class token, so a bare `card`/`grid` matches as well as
// `feature-card`/`cap-grid` (the `(?:^|-)` prefix). These cover every framework naming style in
// the spec's test cases.
// ──────────────────────────────────────────────────────────────────────────────────────────
const DEFAULT_CARD = /(?:^|-)(card|item|tile|cell)\b/
const DEFAULT_CONTAINER = /(?:^|-)grid\b/

const TITLE_PAT = /(?:^|-)(title|name|heading|head|label)$/
const DESC_PAT = /(?:^|-)(desc|text|body|caption|subtitle|sub|detail|blurb)$/
const BADGE_PAT = /(?:^|-)(badge|pill|tag|count|chip)$/i

// ──────────────────────────────────────────────────────────────────────────────────────────
// HTML tree node + tiny dependency-free tree builder + tree helpers
// ──────────────────────────────────────────────────────────────────────────────────────────
// `HNode`, `parseHtml`(↦ local alias `buildTree`), `elements`, `textOf`, `classMatch`,
// `isAncestorOrSelf`, and `parseStyle` now live in `./html-dom` (imported at the top of this
// file). They are shared with the public `parseHtml`/`query` selector engine. `parseCards`
// behaviour is unchanged — it uses the identical parser, now in one place.

/** True when `el` (or an ancestor) matches the exclude pattern. */
function isExcluded (el: HNode, pat: RegExp | undefined): boolean {
	if (!pat) return false
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

/** Returns true when an `<i>`/`<span>` element carries any recognised icon-font classes. */
function isIconEl (el: HNode): boolean {
	if (el.tag !== 'i' && el.tag !== 'span') return false
	const desc = detectIcon(el.classes.join(' '), textOf(el, { keepPUA: true }))
	if (!desc) return false
	// detectIcon returns a descriptor for ANY classed element (fallback fontFamily = tokens[0]).
	// Only treat it as a genuine icon if the family is one we explicitly recognise.
	return ICON_FAMILIES.has(desc.fontFamily) || desc.isLigature
}

/**
 * Pick the PowerPoint font family for a detected icon family + class tokens.
 * Supports FA, Bootstrap Icons, Phosphor, Ionicons, Material Icons, and generic icon fonts.
 */
function fontFaceFor (family: string, classes: string[]): string {
	if (family === 'fa') {
		if (classes.some(c => c === 'fab' || c === 'fa-brands')) return ICON_FONT_FACES.faBrands
		if (classes.some(c => c === 'far' || c === 'fa-regular')) return ICON_FONT_FACES.faRegular
		return ICON_FONT_FACES.faSolid
	}
	if (family === 'bi') return ICON_FONT_FACES.bi
	if (family === 'ph') return ICON_FONT_FACES.ph
	if (family === 'ion') return ICON_FONT_FACES.ion
	if (MATERIAL_FONT_FACE_FAMILIES.has(family)) return ICON_FONT_FACES.material
	return family || ICON_FONT_FACES.faDefault
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
	for (const c of card.children) {
		if (c.tag === '#text') {
			const t = (c.text || '').trim()
			if (t) out.push({ el: c, text: t })
		} else {
			walk(c)
		}
	}
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
		const faEl = findFirst(card, e => isIconEl(e))
		if (faEl) {
			iconEl = faEl
			skip.add(faEl)
			const desc = detectIcon(faEl.classes.join(' '), textOf(faEl, { keepPUA: true }))
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
	const badgePat = opts.badgePattern || BADGE_PAT
	const badgeMax = opts.badgeMaxChars ?? 24
	const badgeEl = findFirst(card, e => classMatch(e, badgePat) && textOf(e).trim().length > 0 && textOf(e).trim().length <= badgeMax, skip)
	if (badgeEl) {
		skip.add(badgeEl)
		const bt = textOf(badgeEl).trim()
		const bc = bgOfCtx(badgeEl, ctx)
		badge = { text: bt, color: bc || '' }
	}

	// ── title ─────────────────────────────────────────────────────────────────────────────
	let titleEl: HNode | null = null
	let title = ''
	const titlePat = opts.titlePattern || TITLE_PAT
	const heading = findFirst(card, e => /^(h[1-6]|strong|b)$/.test(e.tag), skip)
	if (heading) { titleEl = heading; title = textOf(heading).trim() }
	if (!title) {
		const classTitleEl = findByTitle(card, skip, titlePat)
		if (classTitleEl) { titleEl = classTitleEl; title = textOf(classTitleEl).trim() }
	}

	// Skip title subtree when searching for description
	if (titleEl) skip.add(titleEl)
	// Also skip any class-based TITLE_PAT match (and its card-child ancestor) to prevent text leakage
	const classTitleHit = findByTitle(card, skip, titlePat)
	if (classTitleHit && classTitleHit !== titleEl) {
		skip.add(classTitleHit)
		// Walk up to the direct child of card so the entire chip/badge wrapper is skipped
		let anc: HNode | null = classTitleHit
		while (anc && anc.parent !== card) anc = anc.parent
		if (anc && anc !== titleEl) skip.add(anc)
	}

	// ── description ───────────────────────────────────────────────────────────────────────
	let description: string | undefined
	const descPat = opts.descPattern || DESC_PAT
	let descEl: HNode | null = findFirst(card, e => classMatch(e, descPat) && textOf(e).trim().length > 0 && !(titleEl && isAncestorOrSelf(e, titleEl)), skip)
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
	// Border alpha (e.g. `border: 2px solid rgba(0,0,0,.4)` or `#rrggbbaa`) → transparency 0–100.
	// Undefined for opaque borders so the default-off line path stays byte-identical (ADR-0006).
	const borderTransparency = transparencyOf(card, 'border', ctx) ?? transparencyOf(card, 'border-color', ctx)
	if (borderTransparency != null && borderTransparency > 0) colors.borderTransparency = borderTransparency
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
function findByTitle (card: HNode, skip: Set<HNode>, titlePat: RegExp = TITLE_PAT): HNode | null {
	return findFirst(card, e => classMatch(e, titlePat) && textOf(e).trim().length > 0, skip)
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// Sibling adoption — structural similarity test
// ──────────────────────────────────────────────────────────────────────────────────────────

/** Classes that must NEVER be adopted (quote/callout/testimonial/blockquote variants). */
const NEVER_ADOPT_CLASS = /(^|-)(quote|callout|testimonial|blockquote)\b/

/** True when the subtree contains an inline `<svg>` or an icon-font `<i>`/`<span>`. */
function hasIcon (node: HNode): boolean {
	return !!findFirst(node, e => e.tag === 'svg') ||
		!!findFirst(node, e => isIconEl(e))
}

/** Returns true when `sibling` is structurally similar to the already-detected `cards`. */
function isStructurallySimilar (sibling: HNode, cards: HNode[], contPat: RegExp, ctx: CssContext, opts: ParseCardsOptions): boolean {
	const neverAdopt = opts.neverAdoptPattern || NEVER_ADOPT_CLASS
	const titlePat = opts.titlePattern || TITLE_PAT
	const maxChars = opts.titleMaxChars ?? 60
	// Never adopt <blockquote> elements or elements with quote/callout/testimonial classes
	if (sibling.tag === 'blockquote') return false
	if (sibling.classes.some(c => neverAdopt.test(c))) return false

	// Never adopt a sibling that is itself a card CONTAINER (a second grid/flex row): its
	// CHILDREN are cards, not the element itself — adopting it would swallow them as one card.
	const disp = cssProp(sibling, 'display', ctx)
	if (classMatch(sibling, contPat) || disp === 'grid' || disp === 'flex' || cssProp(sibling, 'grid-template-columns', ctx) !== undefined) return false

	// Count child elements (excluding #text nodes) of the sibling
	const sibChildCount = sibling.children.filter(c => c.tag !== '#text').length

	// Average child-element count across detected cards
	const totalChildren = cards.reduce((sum, card) => sum + card.children.filter(c => c.tag !== '#text').length, 0)
	const avgCardChildCount = totalChildren / cards.length

	// Structural child-count must be within ±1 of the average
	if (Math.abs(sibChildCount - avgCardChildCount) > 1) return false

	// Icon check: sibling has an icon OR the majority of existing cards have no icon
	if (!hasIcon(sibling)) {
		const cardsWithIcon = cards.filter(hasIcon).length
		if (cardsWithIcon > cards.length / 2) return false
	}

	// Title-likeness: a card leads with short heading-like text. A titled element (TITLE_PAT
	// class or <h1>–<h6>) qualifies; otherwise the first text block must be ≤titleMaxChars chars. Prose
	// siblings (footnotes, disclaimers, captioned quotes) fail this and are not adopted.
	const titleish = findFirst(sibling, e => (classMatch(e, titlePat) || /^h[1-6]$/.test(e.tag)) && textOf(e).trim().length > 0)
	if (!titleish) {
		const firstTextEl = findFirst(sibling, e => e.children.some(c => c.tag === '#text' && (c.text || '').trim().length > 0))
		const t = firstTextEl ? textOf(firstTextEl).trim() : ''
		if (t.length === 0 || t.length > maxChars) return false
	}

	return true
}

// ──────────────────────────────────────────────────────────────────────────────────────────
// parseCards — the public entry
// ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * True when EVERY direct element child of `e` is a structural icon+label TILE (one icon node + a
 * short label) and the children are uniform — a class- and CSS-agnostic tile row (SAU-40). This is
 * the signal that lets a class-token-free, externally-styled `.stack`/`.stack-row` row be recognised
 * even though it carries no card/grid class and no inline/`<style>`-resolvable display.
 */
function isTileRow (e: HNode): boolean {
	const childEls = e.children.filter(c => c.tag !== '#text')
	if (childEls.length < 2) return false
	const isTile = (c: HNode): boolean => {
		const hasIconNode = !!findFirst(c, n => n.tag === 'svg') || !!findFirst(c, n => isIconEl(n)) || !!leadingEmoji(textOf(c))
		if (!hasIconNode) return false
		const label = textOf(c).trim()
		return label.length > 0 && label.length <= 40
	}
	if (!childEls.every(isTile)) return false
	const counts = childEls.map(c => c.children.filter(k => k.tag !== '#text').length)
	const avg = counts.reduce((s, n) => s + n, 0) / counts.length
	return !counts.some(n => Math.abs(n - avg) > 1)
}

/** Locate a grid/flex container whose repeated children are the cards. */
function findContainer (allEls: HNode[], contPat: RegExp, exclPat: RegExp | undefined, ctx: CssContext): HNode | null {
	for (const e of allEls) {
		if (isExcluded(e, exclPat)) continue
		const childEls = e.children.filter(c => c.tag !== '#text')
		if (childEls.length < 2) continue
		if (classMatch(e, contPat)) return e
		const disp = cssProp(e, 'display', ctx)
		if ((disp === 'grid' || cssProp(e, 'grid-template-columns', ctx) !== undefined) && childEls.length >= 2) return e
		if (disp === 'flex' && childEls.length >= 3) return e
		// FALLBACK (SAU-40): a class-token-free / externally-styled row of icon+label tiles. Only
		// reached when the class/grid/flex signals above did NOT match, so previously-recognised
		// inputs keep selecting the same container — this strictly ADDS the dropped tile rows.
		if (isTileRow(e)) return e
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
	const exclPat = opts.excludeWithin

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
		const cont = findContainer(allEls, contPat, exclPat, ctx)
		if (cont) cards = cont.children.filter(c => c.tag !== '#text')
	}

	// clamp-don't-crash: a lone card (or none) is not a grid → empty result
	if (cards.length < 2) return []

	// ── SIBLING ADOPTION ──────────────────────────────────────────────────────────────────
	// After cards are detected, scan the container's immediate following siblings.
	// Structurally similar siblings are appended; first non-match terminates.
	const container = cards[0].parent
	if (container && container.parent) {
		const parentChildren = container.parent.children.filter(c => c.tag !== '#text')
		const containerIdx = parentChildren.indexOf(container)
		if (containerIdx >= 0) {
			for (let i = containerIdx + 1; i < parentChildren.length; i++) {
				const sib = parentChildren[i]
				// A sibling that contains an already-detected card (e.g. row 2 of a two-row
				// class-matched grid) is part of the card region — skip it, never adopt it.
				if (cards.some(c => isAncestorOrSelf(sib, c))) continue
				if (isStructurallySimilar(sib, cards, contPat, ctx, opts)) {
					cards.push(sib)
				} else {
					break // first non-match terminates scanning
				}
			}
		}
	}

	return cards.map(c => analyzeCard(c, opts, ctx, cssCodepoints))
}

export default parseCards
