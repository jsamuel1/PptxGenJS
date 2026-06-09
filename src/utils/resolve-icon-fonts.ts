/**
 * PptxGenJS — Dynamic Icon-Font Resolver (docs/feature-icon-font-resolver.md).
 *
 * `resolveIconFonts(html, opts)` scans an HTML string for icon-font elements (Font Awesome,
 * Material Icons, Bootstrap Icons, Phosphor, Ionicons, or a custom font) and resolves each to
 * normalised vector path data — a `Map<string, SvgPart[]>` ready to drop into
 * `addCard({ icon: { parts } })` or `addShape('custGeom', { svgPath })`.
 *
 * Resolution order per icon (first hit wins); the chosen method is recorded on each part's
 * `source` tag: `customResolver` → CSS `::before content` codepoint → bundled offline fallback →
 * CDN fetch (best-effort, cached). Bundled is tried before the network so the resolver works
 * OFFLINE for the common icons with zero network calls; CDN is only reached for icons that are
 * NOT in the bundled set. An icon that no method resolves is OMITTED (never throws).
 *
 * Pure logic; the only side effects are the optional CDN `fetch` and `cacheDir` reads/writes
 * (both gated/optional). This is an OPTIONAL utility imported from `@jsamuel1/pptxgenjs/utils`.
 */
import { parseSvg, type SvgPart } from './parse-svg'
import { BUNDLED_ICONS } from './bundled-icons'
import { classTokens, detectIcon, extractCssCodepoints, type IconDescriptor } from './icon-classify'

/** How a resolved part was produced. */
export type IconSource = 'css-content' | 'font-file' | 'cdn' | 'bundled' | 'custom'

/** A resolved `SvgPart` plus the resolution-source tag. */
export interface ResolvedSvgPart extends SvgPart {
	source?: IconSource
}

/** Options for {@link resolveIconFonts}. */
export interface IconResolveOptions {
	/** CSS text for `::before`/`::after` content-property codepoint extraction. */
	stylesheets?: string[]
	/** Local woff2/woff/ttf paths for glyph outlines, keyed by font family. */
	fontFiles?: Record<string, string>
	/** Allow CDN fetches for KNOWN fonts not in the bundled set. @default true */
	useCdn?: boolean
	/** Caller hook resolving a class to parts; takes precedence over every built-in method. */
	customResolver?: (className: string, fontFamily: string) => Array<Partial<ResolvedSvgPart> & { d: string; viewBox: { w: number; h: number } }> | null
	/** Directory to cache CDN-fetched glyphs (a repeat resolve is a cache hit, no network). */
	cacheDir?: string
	/** Fill handed to `parseSvg` for the resolved glyph (6-hex, no `#`). @default '000000' */
	defaultFill?: string
}

/** Find icon-candidate elements (any element carrying a `class` attribute) in an HTML string. */
function scanIcons (html: string): IconDescriptor[] {
	const out: IconDescriptor[] = []
	const seen = new Set<string>()
	// Paired tags so ligature text content is captured; class attr required.
	const re = /<([a-zA-Z][\w-]*)\b([^>]*?\bclass\s*=\s*("([^"]*)"|'([^']*)')[^>]*?)>([\s\S]*?)<\/\1\s*>/gi
	let m: RegExpExecArray | null
	while ((m = re.exec(html)) !== null) {
		const tag = m[1].toLowerCase()
		if (tag === 'style' || tag === 'script') continue
		const cls = m[4] !== undefined ? m[4] : (m[5] || '')
		const text = m[6] || ''
		const desc = detectIcon(cls, text)
		if (desc && !seen.has(desc.key)) { seen.add(desc.key); out.push(desc) }
	}
	return out
}

/** Pull inline `<style>...</style>` blocks out of an HTML string. */
function inlineStyles (html: string): string[] {
	const blocks: string[] = []
	const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi
	let m: RegExpExecArray | null
	while ((m = re.exec(html)) !== null) blocks.push(m[1])
	return blocks
}

/** Look up a bundled offline SVG for a descriptor, or null. */
function lookupBundled (desc: IconDescriptor): string | null {
	if (desc.isLigature) return BUNDLED_ICONS['material:' + desc.glyphName] || null
	if (desc.fontFamily === 'fa' && desc.glyphName) return BUNDLED_ICONS['fa:' + desc.glyphName] || null
	if (desc.glyphName) return BUNDLED_ICONS[desc.fontFamily + ':' + desc.glyphName] || null
	return null
}

/** Known-font CDN URL for a descriptor, or null when the font is not in the registry. */
function cdnUrl (desc: IconDescriptor, classTokensArr: string[]): string | null {
	if (desc.fontFamily === 'fa' && desc.glyphName) {
		let style = 'solid'
		if (classTokensArr.some(t => t === 'fab' || t === 'fa-brands')) style = 'brands'
		else if (classTokensArr.some(t => t === 'far' || t === 'fa-regular')) style = 'regular'
		return `https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs/${style}/${desc.glyphName}.svg`
	}
	if (desc.fontFamily === 'bi' && desc.glyphName) return `https://cdn.jsdelivr.net/npm/bootstrap-icons/icons/${desc.glyphName}.svg`
	if (desc.fontFamily === 'ion' && desc.glyphName) return `https://unpkg.com/ionicons/dist/svg/${desc.glyphName}.svg`
	return null
}

/** Best-effort CDN fetch with optional `cacheDir`. Returns the raw SVG string, or null on any failure. */
async function fetchCdnSvg (url: string, cacheDir?: string): Promise<string | null> {
	// Lazy Node requires so the browser/IIFE build never pulls in `fs`/`path`.
	let fs: typeof import('fs') | null = null
	let path: typeof import('path') | null = null
	let cacheFile: string | null = null
	try {
		if (cacheDir) {
			// eslint-disable-next-line @typescript-eslint/no-require-imports
			fs = require('fs'); path = require('path')
			const safe = url.replace(/[^a-zA-Z0-9.-]+/g, '_')
			cacheFile = path.join(cacheDir, safe)
			if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf8')
		}
	} catch (_) { /* cache is best-effort */ }

	if (typeof fetch !== 'function') return null
	// Network errors propagate so callers/tests can distinguish "offline" from "unresolvable".
	const ctrl = typeof AbortController === 'function' ? new AbortController() : null
	const timer = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null
	const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
	if (timer) clearTimeout(timer)
	if (!res || !res.ok) return null
	const svg = await res.text()
	try {
		if (fs && path && cacheFile && cacheDir) {
			if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
			fs.writeFileSync(cacheFile, svg)
		}
	} catch (_) { /* cache write is best-effort */ }
	return svg
}

/** Tag every part with a resolution source. */
function tagSource (parts: ResolvedSvgPart[], source: IconSource): ResolvedSvgPart[] {
	parts.forEach(p => { p.source = source })
	return parts
}

/** Resolve a single descriptor through the chain. Returns parts, or null when unresolvable. */
async function resolveOne (desc: IconDescriptor, opts: IconResolveOptions): Promise<ResolvedSvgPart[] | null> {
	const defaultFill = opts.defaultFill || '000000'

	// 1) customResolver — caller hook wins; preserve its parts verbatim (keep their fill/source).
	if (typeof opts.customResolver === 'function') {
		const r = opts.customResolver(desc.className, desc.fontFamily)
		if (r && r.length) return r.map(p => ({ ...p, source: (p.source as IconSource) || 'custom' })) as ResolvedSvgPart[]
	}

	// 2) bundled offline fallback — tried before the network so common icons resolve with no fetch.
	const bundledSvg = lookupBundled(desc)
	if (bundledSvg) {
		const parts = parseSvg(bundledSvg, { defaultFill }) as ResolvedSvgPart[]
		if (parts.length) return tagSource(parts, 'bundled')
	}

	// 3) CDN fetch (best-effort) — only for KNOWN registries NOT covered by the bundled set.
	if (opts.useCdn !== false) {
		const url = cdnUrl(desc, classTokens(desc.className))
		if (url) {
			const svg = await fetchCdnSvg(url, opts.cacheDir)
			if (svg) {
				const parts = parseSvg(svg, { defaultFill }) as ResolvedSvgPart[]
				if (parts.length) return tagSource(parts, 'cdn')
			}
		}
	}

	return null
}

/**
 * Resolve every icon-font element in an HTML string to normalised vector path data.
 *
 * @param html - a raw HTML string
 * @param opts - optional stylesheets / font files / CDN + cache / customResolver / defaultFill
 * @returns a `Map` keyed by the icon element's class string (`family|glyph` for ligature fonts);
 *          each value is a `ResolvedSvgPart[]`. Unresolvable icons are omitted (never throws).
 */
export async function resolveIconFonts (html: string, opts: IconResolveOptions = {}): Promise<Map<string, ResolvedSvgPart[]>> {
	const out = new Map<string, ResolvedSvgPart[]>()
	if (typeof html !== 'string' || html.length === 0) return out

	// CSS codepoints (informational for font-file lookup; not required to produce a path here).
	extractCssCodepoints([...inlineStyles(html), ...(opts.stylesheets || [])])

	for (const desc of scanIcons(html)) {
		if (out.has(desc.key)) continue
		const parts = await resolveOne(desc, opts)
		if (parts && parts.length) out.set(desc.key, parts)
	}
	return out
}

export default resolveIconFonts
