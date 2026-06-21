/**
 * PptxGenJS — shared icon-font classifier helpers.
 *
 * Pure, dependency-free utilities for turning an element's class string (and, for ligature fonts,
 * its text content) into an {@link IconDescriptor}, plus a `::before`/`::after` codepoint extractor.
 *
 * Extracted from `resolve-icon-fonts.ts` so that BOTH `resolveIconFonts()` and `parseCards()` share
 * one classifier and cannot drift in how they recognise Font Awesome / Bootstrap / Phosphor /
 * Ionicons / Material families. Behaviour is byte-identical to the original private helpers.
 */
import { FA_MODIFIERS, ICON_FAMILIES } from './icon-fonts.constants'
import { textOf, leadingEmoji } from './html-dom'
import type { HNode } from './html-dom'

/** Classified icon-font element. */
export interface IconDescriptor {
	/** Map key: full class string, or `family|glyph` for ligature fonts. */
	key: string
	/** Original element class string (passed verbatim to `customResolver`). */
	className: string
	/** Resolved font family / category. */
	fontFamily: string
	/** Glyph name (FA token name, or the ligature text for Material). */
	glyphName: string
	/** True for ligature fonts (Material Icons/Symbols). */
	isLigature: boolean
}

/** Split a class attribute into non-empty tokens. */
export function classTokens (cls: string): string[] {
	return (cls || '').trim().split(/\s+/).filter(Boolean)
}

/** Classify one element's class string (+ text content) into an icon descriptor, or null. */
export function detectIcon (cls: string, text: string): IconDescriptor | null {
	const tokens = classTokens(cls)
	if (tokens.length === 0) return null

	// Ligature fonts (Material Icons / Material Symbols): the glyph is the element text.
	const mat = tokens.find(t => /^material-(icons|symbols)(-[a-z]+)?$/.test(t))
	if (mat) {
		const glyph = (text || '').trim()
		if (!glyph) return null
		return { key: mat + '|' + glyph, className: cls.trim(), fontFamily: mat, glyphName: glyph, isLigature: true }
	}

	// Class-token fonts: find a glyph token among the common icon-font conventions.
	let family = ''
	let glyph = ''
	for (const t of tokens) {
		let m: RegExpExecArray | null
		if ((m = /^fa-([a-z0-9-]+)$/.exec(t)) && !FA_MODIFIERS.has(m[1])) { glyph = glyph || m[1]; family = family || 'fa' }
		else if (/^(fas|far|fab|fal|fad|fat|fa-solid|fa-regular|fa-brands)$/.test(t)) { family = family || 'fa' }
		else if ((m = /^bi-([a-z0-9-]+)$/.exec(t))) { glyph = glyph || m[1]; family = family || 'bi' }
		else if ((m = /^ph-([a-z0-9-]+)$/.exec(t)) && m[1] !== 'fill' && m[1] !== 'bold' && m[1] !== 'duotone') { glyph = glyph || m[1]; family = family || 'ph' }
		else if ((m = /^ion-([a-z0-9-]+)$/.exec(t))) { glyph = glyph || m[1]; family = family || 'ion' }
		else if ((m = /^icon-([a-z0-9-]+)$/.exec(t))) { glyph = glyph || m[1]; family = family || 'icon' }
	}

	// Return a descriptor for ANY classed element so the chain can still try customResolver/CSS;
	// unresolvable elements are omitted later (never an error).
	return { key: cls.trim(), className: cls.trim(), fontFamily: family || tokens[0], glyphName: glyph, isLigature: false }
}

/**
 * True when `el` is an `<i>`/`<span>` carrying a recognised icon-font class (FA/BI/PH/ION/Material…).
 *
 * This is the SHARED de-fang for {@link detectIcon}'s permissive `family || tokens[0]` fallback:
 * `detectIcon` returns a descriptor for ANY classed element, so callers that want a GENUINE icon
 * element must re-gate on a recognised family (or a ligature). Hoisted to one definition so the
 * `parseCards` and `parseContent`/tile recognisers cannot drift — if one copy dropped the family
 * check, every classed `<span>` would become a phantom icon.
 */
export function isFontIconEl (el: HNode): boolean {
	if (el.tag !== 'i' && el.tag !== 'span') return false
	const desc = detectIcon(el.classes.join(' '), textOf(el, { keepPUA: true }))
	if (!desc) return false
	return ICON_FAMILIES.has(desc.fontFamily) || desc.isLigature
}

/** Default max characters for a tile label — a tile is a SHORT label beside an icon, not prose. */
export const TILE_LABEL_MAX = 40

/** Find the first descendant (or self) satisfying `pred`, preorder. */
function findInTree (node: HNode, pred: (n: HNode) => boolean): boolean {
	for (const c of node.children) {
		if (c.tag === '#text') continue
		if (pred(c) || findInTree(c, pred)) return true
	}
	return false
}

/**
 * True when `node`'s subtree carries a "tile icon": an inline `<svg>`, a recognised font-icon
 * `<i>`/`<span>` (via {@link isFontIconEl}), or a leading-emoji text cluster. Shared by the
 * `parseCards` and `parseContent` tile-row recognisers so they cannot drift.
 */
export function hasTileIcon (node: HNode): boolean {
	if (findInTree(node, n => n.tag === 'svg') || findInTree(node, isFontIconEl)) return true
	return leadingEmoji(textOf(node)) !== undefined
}

/**
 * True when `container`'s direct element children form a UNIFORM icon+label tile row: ≥2 children,
 * EVERY child is a tile (has an icon node + a non-empty label ≤ `labelMax` chars), and the children
 * are structurally uniform (their element-child counts are within ±1 of the mean). The single
 * definition of the "tile row" rule (SAU-40) — the magic `labelMax` and the ±1 tolerance live here.
 */
export function isUniformTileRow (container: HNode, labelMax: number = TILE_LABEL_MAX): boolean {
	const childEls = container.children.filter(c => c.tag !== '#text')
	if (childEls.length < 2) return false
	for (const c of childEls) {
		if (!hasTileIcon(c)) return false
		const label = textOf(c).trim()
		if (label.length === 0 || label.length > labelMax) return false
	}
	const counts = childEls.map(c => c.children.filter(k => k.tag !== '#text').length)
	const avg = counts.reduce((s, n) => s + n, 0) / counts.length
	return !counts.some(n => Math.abs(n - avg) > 1)
}

/**
 * Extract `class -> codepoint` mappings from `::before`/`::after` `content` rules in the given CSS
 * (inline `<style>` blocks + caller stylesheets). The codepoint informs font-file lookup; on its own
 * it does not produce a path in this minimal build.
 */
export function extractCssCodepoints (cssBlocks: string[]): Record<string, string> {
	const out: Record<string, string> = {}
	const ruleRe = /\.([\w-]+)\s*::?(?:before|after)\s*\{[^}]*?content\s*:\s*(["'])([^"']*)\2[^}]*\}/gi
	for (const css of cssBlocks) {
		let m: RegExpExecArray | null
		while ((m = ruleRe.exec(css || '')) !== null) {
			const cls = m[1]
			const raw = m[3]
			const cp = raw.replace(/\\([0-9a-fA-F]{1,6})\s?/g, '$1') // unescape \e900 -> e900
			out[cls] = cp
		}
	}
	return out
}
