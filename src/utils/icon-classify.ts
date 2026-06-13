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
import { FA_MODIFIERS } from './icon-fonts.constants'

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
