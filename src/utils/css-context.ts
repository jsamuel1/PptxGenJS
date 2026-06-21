/**
 * PptxGenJS — shared, dependency-free CSS colour-resolution context
 * (docs/features/feature-html-content-extractors.md).
 *
 * This module promotes the "cascade-lite" colour-resolution context that already backs
 * `parseCards()` out of `parse-cards.ts` into a shared surface, so `parseCards` and the new
 * HTML content extractors (`parseTable`/`parseColumns`/…) resolve colours through ONE
 * implementation. It is a behaviour-neutral move — `parseCards` output is byte-identical.
 *
 * COLOUR SCOPE: colours are resolved from INLINE `style="…"`, from simple class rules in a
 * `<style>` block (`.foo { background; color; border; border-left }`, last-declared wins), from
 * type selectors (`h1`, `td`, `h1.title` — bare tag or tag+classes, lowest priority), and
 * from `var(--name[, fallback])` references against `:root`/`html`/`body` custom properties — in
 * both inline styles and class/type rules. Precedence is INLINE STYLE > CLASS RULE > TYPE RULE.
 * Out of scope: the browser COMPUTED-style cascade (specificity ranking, id/descendant/combinator
 * selectors, `@media`), which needs a live DOM and is incompatible with string-input,
 * zero-dependency parsing.
 */
import { parseStyle } from './html-dom'
import type { HNode } from './html-dom'
import { normalizeColor, alphaFromColor } from './color-convert'

/** Hex colour string (6-digit, no leading `#`). */
export type HexColor = string

/** A simple single-element class rule from a `<style>` block. */
export interface ClassRule { classes: string[], decls: Record<string, string> }

/** A type selector rule (bare tag or tag+classes) from a `<style>` block. */
export interface TypeRule { tag: string, classes: string[], decls: Record<string, string> }

/** Parsed stylesheet context threaded through colour analysis. Empty ⇒ inline-only (legacy) behaviour. */
export interface CssContext { rootVars: Record<string, string>, classRules: ClassRule[], typeRules: TypeRule[] }

/** Empty context — yields byte-identical output to inline-only parsing. */
export const EMPTY_CSS: CssContext = { rootVars: {}, classRules: [], typeRules: [] }

/** Match the FIRST colour token of a (possibly compound) CSS value: a hex, or any colour function. */
const FIRST_COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|(?:rgba?|hsla?|hwb|oklch|lab)\([^)]*\)/i

/** Extract the first colour in a CSS value as 6-digit hex (no `#`); delegates to normalizeColor. */
export function extractHex (v: string | undefined): string | undefined {
	if (!v) return undefined
	// Try normalizeColor on the full value first (handles standalone colours)
	const full = normalizeColor(v)
	if (/^[0-9A-F]{6,8}$/.test(full)) return full.slice(0, 6)
	// Compound value (e.g. `3px solid #abc` / `2px solid oklch(.7 .1 30 / .4)`): extract the FIRST
	// colour token (hex OR any colour function) — the SAME token set transparencyFromColor reads, so
	// colour and alpha coverage stay in lockstep (SAU-69).
	const m = v.match(FIRST_COLOR_TOKEN)
	if (m) { const r = normalizeColor(m[0]); if (/^[0-9A-F]{6,8}$/.test(r)) return r.slice(0, 6) }
	return undefined
}

/**
 * Border/line transparency (percent, 0–100) implied by the FIRST colour in a CSS value.
 *
 * Alpha is read through {@link alphaFromColor} — the SAME `color-convert` path `normalizeColor`
 * uses — so transparency coverage stays in lockstep with colour coverage: it now reads the alpha
 * of `rgb()/rgba()`/`hsl()/hsla()`/`hwb()`/`oklch()`/`lab()` in BOTH comma and modern slash
 * syntax, plus 8-digit `#rrggbbaa` (and the `#rgba` shorthand). Returns `(1 - alpha) * 100`
 * rounded. Returns `undefined` when no alpha is present OR the colour is fully OPAQUE (`rgb()`
 * with no alpha, 3/6-digit hex, named colours, any `alpha >= 1`) so callers leave the default-off
 * path byte-identical (ADR-0006).
 */
export function transparencyFromColor (v: string | undefined): number | undefined {
	if (!v) return undefined
	// Try the whole value first (a standalone colour), then the first colour token of a compound
	// value (e.g. `2px solid rgb(0 0 0 / .4)`), so the two cover-paths match normalizeColor's.
	let alpha = alphaFromColor(v)
	if (alpha === undefined) {
		const m = v.match(FIRST_COLOR_TOKEN)
		if (m) alpha = alphaFromColor(m[0])
	}
	if (alpha === undefined || !isFinite(alpha)) return undefined
	const clamped = Math.max(0, Math.min(1, alpha))
	if (clamped >= 1) return undefined // fully opaque ⇒ omit (default-off, byte-identical)
	return Math.round((1 - clamped) * 100)
}

/** Border/line transparency (0–100) of a CSS property of `el` honouring the cascade (inline > class rule). */
export function transparencyOf (el: HNode, prop: string, ctx: CssContext): number | undefined {
	return transparencyFromColor(cssProp(el, prop, ctx))
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

/** Parse all `<style>…</style>` blocks of the input into `:root` vars + simple class rules + type rules. */
export function parseStyleSheets (html: string): CssContext {
	const rootVars: Record<string, string> = {}
	const classRules: ClassRule[] = []
	const typeRules: TypeRule[] = []
	let css = ''
	const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
	let sm: RegExpExecArray | null
	while ((sm = styleRe.exec(html)) !== null) css += sm[1] + '\n'
	if (!css) return EMPTY_CSS
	css = css.replace(/\/\*[\s\S]*?\*\//g, '') // strip comments
	// Strip @-rule blocks (nested braces)
	css = css.replace(/@[^{]*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '')
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
			} else {
				const tm = s.match(/^([a-zA-Z][\w-]*)((?:\.[-\w]+)*)$/)
				if (tm) typeRules.push({ tag: tm[1].toLowerCase(), classes: tm[2] ? tm[2].split('.').filter(Boolean) : [], decls })
			}
		}
	}
	return { rootVars, classRules, typeRules }
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

/** Merged declarations of all type rules matching `el` (tag matches and every selector class present); later wins. */
export function typeDecls (el: HNode, ctx: CssContext): Record<string, string> {
	if (ctx.typeRules.length === 0 || !el.tag) return {}
	const tag = el.tag.toLowerCase()
	const out: Record<string, string> = {}
	for (const rule of ctx.typeRules) {
		if (rule.tag === tag && rule.classes.every(c => el.classes.includes(c))) Object.assign(out, rule.decls)
	}
	return out
}

/** Strip trailing `!important` from a CSS value. */
function stripImportant(v: string | undefined): string | undefined {
	return v ? v.replace(/\s*!important\s*$/i, '').trim() || undefined : undefined
}

/** Resolved CSS property for `el`: INLINE style (var-resolved) wins, else CLASS RULE, else TYPE RULE. */
export function cssProp (el: HNode, prop: string, ctx: CssContext): string | undefined {
	const inline = resolveVars(el.style[prop], ctx.rootVars)
	if (inline !== undefined && inline !== '') return stripImportant(inline)
	const fromClass = resolveVars(classDecls(el, ctx)[prop], ctx.rootVars)
	if (fromClass !== undefined && fromClass !== '') return stripImportant(fromClass)
	return stripImportant(resolveVars(typeDecls(el, ctx)[prop], ctx.rootVars))
}

/** Background colour of `el` honouring the cascade (inline > class rule, with `var()` resolved). */
export function bgOfCtx (el: HNode, ctx: CssContext): string | undefined {
	return extractHex(cssProp(el, 'background', ctx)) || extractHex(cssProp(el, 'background-color', ctx))
}

/** Colour of a single CSS property of `el` honouring the cascade (inline > class rule). */
export function colorOf (el: HNode, prop: string, ctx: CssContext): string | undefined {
	return extractHex(cssProp(el, prop, ctx))
}

/** Count depth-0 whitespace-separated tokens (parenthesized groups count as one token). */
function countTokens(s: string): number {
	let depth = 0, count = 0, inToken = false
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]
		if (ch === '(') { depth++; inToken = true }
		else if (ch === ')') { depth-- }
		else if (/\s/.test(ch) && depth === 0) { if (inToken) { count++; inToken = false } }
		else { inToken = true }
	}
	if (inToken) count++
	return count
}

/** Explicit grid column count from `grid-template-columns`; undefined when indeterminate. */
export function gridColumnsOf(node: HNode, ctx: CssContext): number | undefined {
	const v = cssProp(node, 'grid-template-columns', ctx)
	if (!v) return undefined
	// repeat(auto-fit/auto-fill, ...) → undefined (can't determine count)
	if (/auto-(fit|fill)/i.test(v)) return undefined
	// Handle repeat(N, ...) by extracting the inner content and multiplying
	let total = 0
	const parts = v.trim()
	// Split into top-level segments: tokens and repeat(...) calls
	let depth = 0, seg = '', i = 0
	while (i < parts.length) {
		const ch = parts[i]
		if (ch === '(' ) { depth++; seg += ch }
		else if (ch === ')') { depth--; seg += ch }
		else if (/\s/.test(ch) && depth === 0) {
			if (seg) { total += resolveSegment(seg); seg = '' }
		}
		else { seg += ch }
		i++
	}
	if (seg) total += resolveSegment(seg)
	return total || undefined
}

function resolveSegment(seg: string): number {
	const rep = seg.match(/^repeat\(\s*(\d+)\s*,\s*([\s\S]*)\)$/i)
	if (rep) return parseInt(rep[1], 10) * countTokens(rep[2])
	return 1
}

/** Flex layout info for `node`; undefined when display is not flex. */
export function flexInfoOf(node: HNode, ctx: CssContext): { direction: 'row' | 'column', wrap: boolean, grow: number | undefined } | undefined {
	const display = cssProp(node, 'display', ctx)
	if (!display || !/flex/i.test(display)) return undefined
	// Explicit longhand wins over shorthand
	const fg = cssProp(node, 'flex-grow', ctx)
	const flex = cssProp(node, 'flex', ctx)
	let grow: number | undefined
	if (fg) {
		grow = parseFloat(fg)
	} else if (flex) {
		const m = flex.match(/^\s*(\d+(?:\.\d+)?)/)
		if (m) grow = parseFloat(m[1])
	}
	// flex-direction / flex-wrap: check longhands first, then flex-flow shorthand
	let dir = cssProp(node, 'flex-direction', ctx)
	let wrap = cssProp(node, 'flex-wrap', ctx)
	if (!dir || !wrap) {
		const flow = cssProp(node, 'flex-flow', ctx)
		if (flow) {
			if (!dir && /column/i.test(flow)) dir = 'column'
			if (!wrap && /wrap/i.test(flow) && !/nowrap/i.test(flow)) wrap = 'wrap'
		}
	}
	return {
		direction: (dir && /column/i.test(dir)) ? 'column' : 'row',
		wrap: wrap ? /wrap/i.test(wrap) && !/nowrap/i.test(wrap) : false,
		grow: grow !== undefined && !isNaN(grow) ? grow : undefined,
	}
}

/** CSS `column-count` value (from `column-count` or `columns:` shorthand); undefined when absent or non-numeric. */
export function columnCountOf(node: HNode, ctx: CssContext): number | undefined {
	const cc = cssProp(node, 'column-count', ctx)
	if (cc) { const n = parseInt(cc, 10); if (isFinite(n) && n >= 1) return n }
	const cols = cssProp(node, 'columns', ctx)
	if (cols) {
		// `columns: <width>? <count>?` — the bare integer token (no length unit) is the count.
		for (const t of cols.trim().split(/\s+/)) {
			if (/^\d+$/.test(t)) { const n = parseInt(t, 10); if (isFinite(n) && n >= 1) return n }
		}
	}
	return undefined
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
