/**
 * PptxGenJS — `<img>` image extractor (docs/feature-html-content-extractors.md; SAU-74).
 *
 * Surfaces source images — `<img>`, and the image inside a `<picture>` — as neutral, structured
 * {@link ImageNode}s so a converter can embed images that `parseCards`/`parseContent` otherwise drop
 * (brand marks, banner/diagram images, content photos). Each node carries the resolved `src`, the
 * `alt` text, and the intrinsic `width`/`height` when expressible from `width`/`height` attributes or
 * an inline `style` (`width`/`height` in `px`).
 *
 * DESIGN PRINCIPLE (matches parse-content.ts): this extractor **represents** the HTML, it does NOT
 * fetch, decode, or embed anything. It is pure, synchronous, and DEPENDENCY-FREE — the consumer
 * fetches/embeds the `src` (fetch-not-bundle; ADR-0004 analogue). `src` resolution is byte-faithful:
 * a data URI and an absolute URL pass through verbatim; a relative URL is resolved ONLY when the
 * caller supplies `baseUrl` (otherwise the original relative value is preserved — never guessed).
 *
 * NEUTRAL — no slide-role judgement, no archetype. Returns `[]` (never `null`) when no image exists.
 * Reuses `parseHtml`/`query`/`textOf`/`attr`/`isExcluded` from `./html-dom`; adds no new dependency.
 */
import { parseHtml, query, attr, elements, isExcluded } from './html-dom'
import type { HNode } from './html-dom'

/** A neutral structured image node, ready for a converter to fetch + embed. */
export interface ImageNode {
	/** Discriminant — always `'image'`. */
	kind: 'image'
	/**
	 * The image source: a data URI (`data:…`) or absolute URL passed through verbatim; a relative
	 * URL resolved against `options.baseUrl` when supplied, else preserved as authored. The consumer
	 * fetches/embeds this — the extractor never reads it.
	 */
	src: string
	/** Alternative text (`alt` attribute, trimmed). Empty string when absent — `alt=""` is meaningful. */
	alt: string
	/** Intrinsic width in CSS px, when expressible from the `width` attr or inline `style`. Omitted otherwise. */
	width?: number
	/** Intrinsic height in CSS px, when expressible from the `height` attr or inline `style`. Omitted otherwise. */
	height?: number
}

/** Options for {@link parseImages}. */
export interface ParseImageOptions {
	/** Class pattern; an image within a matching region is skipped (mockups/flows). Mirrors parse-content. */
	excludeWithin?: RegExp
	/**
	 * Base URL for resolving a RELATIVE `src` (e.g. `'https://host/path/'`). When omitted (default),
	 * a relative `src` is preserved verbatim — never guessed. Data URIs and absolute URLs are always
	 * passed through unchanged regardless of `baseUrl`.
	 */
	baseUrl?: string
}

/** Resolve the input to a root {@link HNode} (string parsed fresh; an HNode used as-is). */
function toRoot (input: string | HNode): HNode {
	return typeof input === 'string' ? parseHtml(input) : input
}

/** True when `value` already carries a scheme/protocol-relative/data/fragment form → leave verbatim. */
function isAbsoluteLike (value: string): boolean {
	// scheme:  (http:, https:, data:, blob:, file:, mailto:, tel:, etc.) · protocol-relative `//host`
	return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')
}

/**
 * Resolve `raw` against `baseUrl` when (a) a base is given, (b) `raw` is relative, and (c) the WHATWG
 * `URL` constructor is available (Node + browsers). Any failure (bad base, no `URL`) falls back to the
 * verbatim `raw` — resolution is best-effort and NEVER throws.
 */
function resolveSrc (raw: string, baseUrl?: string): string {
	if (!baseUrl || isAbsoluteLike(raw)) return raw
	try {
		return new URL(raw, baseUrl).href
	} catch {
		return raw
	}
}

/**
 * Parse a CSS/HTML length into a finite number of px, or `undefined`. Accepts a bare number
 * (`"480"`, `480`) and an explicit `px` length (`"480px"`); REJECTS percentages, `auto`, `em`/`rem`/
 * `vw` and any other relative/non-px unit (not expressible as an intrinsic pixel size). Clamps to a
 * non-negative, finite value (ADR-0005: out-of-range inputs clamp, never crash); `0`/negative → omit.
 */
function toPx (value: string | undefined): number | undefined {
	if (value == null) return undefined
	const t = String(value).trim()
	if (!t) return undefined
	// Bare integer/decimal, or a `px` length. Anything with another unit / `%` / `auto` is rejected.
	const m = t.match(/^(-?\d*\.?\d+)(px)?$/i)
	if (!m) return undefined
	const n = Number(m[1])
	if (!Number.isFinite(n) || n <= 0) return undefined
	return n
}

/** Intrinsic size from the `width`/`height` ATTRIBUTE first, then the inline `style` length. */
function dimensionOf (el: HNode, axis: 'width' | 'height'): number | undefined {
	return toPx(attr(el, axis)) ?? toPx(el.style[axis])
}

/**
 * The effective `src` for an element: an `<img>`'s own `src`, else — for a `<picture>` or `<source>`
 * — the first candidate of the first `srcset` (the largest/first listed URL, descriptor stripped),
 * else the `<img>` `src` inside a `<picture>`. Returns `undefined` when no usable source is present.
 * `srcset` only contributes its URL token; widths/densities are descriptors the consumer can ignore.
 */
function srcOf (el: HNode): string | undefined {
	const direct = attr(el, 'src')
	if (direct != null && direct.trim()) return direct.trim()
	const srcset = attr(el, 'srcset')
	if (srcset != null && srcset.trim()) {
		// First comma-separated candidate; first whitespace token is the URL (rest are descriptors).
		const first = srcset.split(',')[0].trim()
		const url = first.split(/\s+/)[0]
		if (url) return url
	}
	return undefined
}

/** Build an {@link ImageNode} from an element with a usable source, or `null`. */
function toImageNode (el: HNode, opts: ParseImageOptions): ImageNode | null {
	const rawSrc = srcOf(el)
	if (rawSrc == null) return null
	const node: ImageNode = {
		kind: 'image',
		src: resolveSrc(rawSrc, opts.baseUrl),
		alt: (attr(el, 'alt') ?? '').trim(),
	}
	const width = dimensionOf(el, 'width')
	if (width !== undefined) node.width = width
	const height = dimensionOf(el, 'height')
	if (height !== undefined) node.height = height
	return node
}

/**
 * Extract every image — `<img>` and the resolved image of a `<picture>` — as a neutral
 * {@link ImageNode} (`{ kind:'image', src, alt, width?, height? }`), in document order. A standalone
 * `<img>`, a card/tile `<img>`, and a `<picture>` all surface. Each node's `src` is resolved (data
 * URI / absolute URL verbatim; relative resolved against `options.baseUrl` when given), `alt` is the
 * trimmed alt text (`''` when absent), and `width`/`height` carry the intrinsic px size when the
 * `width`/`height` attribute or an inline `style` px length expresses it.
 *
 * NEUTRAL & DEPENDENCY-FREE — represents the HTML, never fetches/embeds. Returns `[]` (NOT `null`)
 * when no image is present. Accepts a raw HTML string OR an `HNode` from `parseHtml`.
 *
 * @param input - a raw HTML string OR an `HNode` from `parseHtml`.
 * @param options - `excludeWithin` skips images inside a matching region; `baseUrl` resolves relative `src`.
 */
export function parseImages (input: string | HNode, options: ParseImageOptions = {}): ImageNode[] {
	const root = toRoot(input)
	const exclPat = options.excludeWithin
	const out: ImageNode[] = []
	// `<img>`s nested inside a `<picture>` are surfaced by the `<picture>` branch, not again as a
	// standalone `<img>`. We pre-mark them so the single document-order walk never double-counts.
	const insidePicture = new Set<HNode>()
	for (const pic of query(root, 'picture')) {
		for (const im of query(pic, 'img')) insidePicture.add(im)
	}

	// Single preorder (document-order) walk: a `<picture>` represents itself once (precedence below);
	// a standalone `<img>` represents itself. `<source>` is consumed only via its parent `<picture>`.
	for (const el of elements(root)) {
		if (exclPat && isExcluded(el, exclPat)) continue
		if (el.tag === 'picture') {
			const node = pictureNode(el, options)
			if (node) out.push(node)
		} else if (el.tag === 'img' && !insidePicture.has(el)) {
			const node = toImageNode(el, options)
			if (node) out.push(node)
		}
	}
	return out
}

/**
 * Represent a `<picture>` as one {@link ImageNode}. Source precedence mirrors the browser: the inner
 * `<img src>` (the element actually rendered when no `<source>` matches) wins; only when the `<img>`
 * carries no usable `src` does the first `<source>`'s `srcset` URL stand in — inheriting the inner
 * `<img>`'s `alt`/size. `null` when neither yields a usable source.
 */
function pictureNode (pic: HNode, opts: ParseImageOptions): ImageNode | null {
	const innerImg = query(pic, 'img')[0] || null
	let node = innerImg ? toImageNode(innerImg, opts) : null
	if (!node) {
		const firstSource = query(pic, 'source')[0]
		if (!firstSource) return null
		node = toImageNode(firstSource, opts)
		if (node && innerImg) {
			node.alt = (attr(innerImg, 'alt') ?? '').trim()
			const w = dimensionOf(innerImg, 'width'); if (w !== undefined) node.width = w
			const h = dimensionOf(innerImg, 'height'); if (h !== undefined) node.height = h
		}
	}
	return node
}
