/**
 * PptxGenJS — shared, dependency-free CSS colour-resolution context
 * (docs/feature-html-content-extractors.md).
 *
 * This module promotes the "cascade-lite" colour-resolution context that already backs
 * `parseCards()` out of `parse-cards.ts` into a shared surface, so `parseCards` and the new
 * HTML content extractors (`parseTable`/`parseColumns`/…) resolve colours through ONE
 * implementation. It is a behaviour-neutral move — `parseCards` output is byte-identical.
 *
 * COLOUR SCOPE: colours are resolved from INLINE `style="…"`, from simple class rules in a
 * `<style>` block (`.foo { background; color; border; border-left }`, last-declared wins), and
 * from `var(--name[, fallback])` references against `:root`/`html`/`body` custom properties — in
 * both inline styles and class rules. Precedence is INLINE STYLE > CLASS RULE. Out of scope: the
 * browser COMPUTED-style cascade (specificity ranking, id/descendant/combinator selectors,
 * `@media`), which needs a live DOM and is incompatible with string-input, zero-dependency parsing.
 */
import { parseStyle } from './html-dom'
import type { HNode } from './html-dom'

/** Hex colour string (6-digit, no leading `#`). */
export type HexColor = string

/** A simple single-element class rule from a `<style>` block. */
export interface ClassRule { classes: string[], decls: Record<string, string> }

/** Parsed stylesheet context threaded through colour analysis. Empty ⇒ inline-only (legacy) behaviour. */
export interface CssContext { rootVars: Record<string, string>, classRules: ClassRule[] }

/** Empty context — yields byte-identical output to inline-only parsing. */
export const EMPTY_CSS: CssContext = { rootVars: {}, classRules: [] }

/** Extract the first colour in a CSS value as 6-digit hex (no `#`); handles `#rgb`/`#rrggbb`/`rgb()`. */
export function extractHex (v: string | undefined): string | undefined {
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

/** Resolve `var(--name[, fallback])` references against `rootVars`; left as-is when unresolved. */
export function resolveVars (value: string | undefined, rootVars: Record<string, string>): string | undefined {
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
export function parseStyleSheets (html: string): CssContext {
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
export function classDecls (el: HNode, ctx: CssContext): Record<string, string> {
	if (ctx.classRules.length === 0 || el.classes.length === 0) return {}
	const out: Record<string, string> = {}
	for (const rule of ctx.classRules) {
		if (rule.classes.every(c => el.classes.includes(c))) Object.assign(out, rule.decls)
	}
	return out
}

/** Resolved CSS property for `el`: INLINE style (var-resolved) wins, else matched CLASS RULE. */
export function cssProp (el: HNode, prop: string, ctx: CssContext): string | undefined {
	const inline = resolveVars(el.style[prop], ctx.rootVars)
	if (inline !== undefined && inline !== '') return inline
	return resolveVars(classDecls(el, ctx)[prop], ctx.rootVars)
}

/** Background colour of `el` honouring the cascade (inline > class rule, with `var()` resolved). */
export function bgOfCtx (el: HNode, ctx: CssContext): string | undefined {
	return extractHex(cssProp(el, 'background', ctx)) || extractHex(cssProp(el, 'background-color', ctx))
}

/** Colour of a single CSS property of `el` honouring the cascade (inline > class rule). */
export function colorOf (el: HNode, prop: string, ctx: CssContext): string | undefined {
	return extractHex(cssProp(el, prop, ctx))
}

/** Resolved CSS declaration for any property: INLINE style (var-resolved) > CLASS RULE. */
export const declOf = cssProp

/** Explicit grid column count from `grid-template-columns`; undefined when indeterminate. */
export function gridColumnsOf(node: HNode, ctx: CssContext): number | undefined {
	const v = cssProp(node, 'grid-template-columns', ctx)
	if (!v) return undefined
	// repeat(auto-fit/auto-fill, ...) → undefined (can't determine count)
	if (/auto-(fit|fill)/i.test(v)) return undefined
	// repeat(N, ...) → N * tokens inside
	const rep = v.match(/repeat\(\s*(\d+)\s*,/)
	if (rep) {
		const n = parseInt(rep[1], 10)
		// Count how many track values inside repeat()
		const inner = v.replace(/^.*repeat\(\s*\d+\s*,\s*/, '').replace(/\).*$/, '')
		const tracks = inner.trim().split(/\s+/).length
		return n * tracks
	}
	// Count space-separated track values (1fr 200px auto → 3)
	return v.trim().split(/\s+/).length
}

/** Flex layout info for `node`; undefined when display is not flex. */
export function flexInfoOf(node: HNode, ctx: CssContext): { direction: 'row' | 'column', wrap: boolean, grow: number | undefined } | undefined {
	const display = cssProp(node, 'display', ctx)
	if (!display || !/flex/i.test(display)) return undefined
	const dir = cssProp(node, 'flex-direction', ctx)
	const wrap = cssProp(node, 'flex-wrap', ctx)
	const flex = cssProp(node, 'flex', ctx)
	const fg = cssProp(node, 'flex-grow', ctx)
	let grow: number | undefined
	if (flex) {
		const m = flex.match(/^\s*(\d+(?:\.\d+)?)/)
		if (m) grow = parseFloat(m[1])
	} else if (fg) {
		grow = parseFloat(fg)
	}
	return {
		direction: (dir && /column/i.test(dir)) ? 'column' : 'row',
		wrap: wrap ? /wrap/i.test(wrap) && !/nowrap/i.test(wrap) : false,
		grow: grow !== undefined && !isNaN(grow) ? grow : undefined,
	}
}

/** CSS `column-count` value; undefined when absent or non-numeric. */
export function columnCountOf(node: HNode, ctx: CssContext): number | undefined {
	const v = cssProp(node, 'column-count', ctx)
	if (!v) return undefined
	const n = parseInt(v, 10)
	return isNaN(n) ? undefined : n
}

/** Pixel width/height; undefined when absent or non-px. */
export function sizeOf(node: HNode, ctx: CssContext): { wPx?: number, hPx?: number } | undefined {
	const w = cssProp(node, 'width', ctx)
	const h = cssProp(node, 'height', ctx)
	const px = (s: string | undefined): number | undefined => {
		if (!s) return undefined
		const m = s.match(/^\s*(\d+(?:\.\d+)?)\s*px/i)
		return m ? parseFloat(m[1]) : undefined
	}
	const wPx = px(w), hPx = px(h)
	if (wPx === undefined && hPx === undefined) return undefined
	return { ...(wPx !== undefined && { wPx }), ...(hPx !== undefined && { hPx }) }
}
