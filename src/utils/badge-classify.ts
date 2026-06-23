/**
 * PptxGenJS — shared, dependency-free eyebrow/kicker/section-label/pill/badge classifier (SAU-76).
 *
 * One place that answers "is THIS element a pill/eyebrow/kicker/badge, and (when so) what is its
 * RESOLVED colour?" — promoted out of `parse-content.ts` and `parse-cards.ts` so the two extractors
 * recognise badges through ONE implementation and cannot drift (ties into SAU-70).
 *
 * Recognition is GENERIC / structure-driven, NOT a closed vocabulary of MSX-specific class names:
 *  - CLASS signal: a class TOKEN whose tail matches the generalised pill family
 *    `badge | pill | tag | count | chip | kicker | eyebrow | section-label` (anchored `(?:^|-)…$`
 *    per token, so `layer-tag` / `reg-badge` / `proven-tag` / `kicker` / `eyebrow` / `section-label`
 *    all match while `vintage-label` / `heritage-tagline` / `protocol` do NOT), OR
 *  - STRUCTURAL signal: a SHORT, ALL-CAPS label element that sits IMMEDIATELY ABOVE a heading
 *    (`h1`–`h6`) among its parent's element children — the classic "eyebrow above a title" pill that
 *    carries no pill class at all. The all-caps + short + before-heading gate avoids false positives
 *    on ordinary short prose (`1985 Edition`, `Since 1900`, a plain `<span>label</span>`).
 *
 * Pure, dependency-free — reuses `textOf`/`classMatch` from `./html-dom`. Colour resolution is the
 * caller's job (it owns the `CssContext`); this module only RECOGNISES.
 */
import { textOf, classMatch } from './html-dom'
import type { HNode } from './html-dom'

/**
 * Generalised pill/badge class pattern (tested against EACH class token via {@link classMatch}).
 * Anchored `(?:^|-)…$`: matches a bare token (`badge`, `kicker`) or a hyphen-suffixed one
 * (`reg-badge`, `layer-tag`, `proven-tag`, `section-label`) while REJECTING substring lookalikes
 * (`vintage-label`, `heritage-tagline`, `protocol`, `colspan`). Generalises the old closed
 * `(badge|pill|tag|count|chip)` vocabulary with the eyebrow/kicker/section-label family — it is a
 * PATTERN, not a hardcoded list of MSX class names.
 */
export const BADGE_CLASS_PAT = /(?:^|-)(badge|pill|tag|count|chip|kicker|eyebrow|section-label)$/i

/** Default upper bound on a structural eyebrow's character length (short labels only). */
export const EYEBROW_LABEL_MAX = 32

/** A token has letters and NONE of them are lowercase → "all-caps" (digits/spaces/punctuation ok). */
function isAllCaps (s: string): boolean {
	if (!/[A-Za-zÀ-ɏ]/.test(s)) return false // must contain at least one letter
	return s === s.toUpperCase() && s !== s.toLowerCase()
}

/** The element children of `el`'s parent, in document order (empty when detached). */
function siblingEls (el: HNode): HNode[] {
	return el.parent ? el.parent.children.filter(c => c.tag !== '#text') : []
}

/**
 * STRUCTURAL eyebrow test: `el` is a SHORT, ALL-CAPS label that sits immediately above a heading
 * (`h1`–`h6`) among its siblings. Generic — no class vocabulary involved. `el` itself must not be a
 * heading. The next non-text sibling must be a heading (the "eyebrow above a title" arrangement).
 */
export function isStructuralEyebrow (el: HNode, labelMax: number = EYEBROW_LABEL_MAX): boolean {
	if (/^h[1-6]$/.test(el.tag)) return false
	const t = textOf(el).trim()
	if (!t || t.length > labelMax) return false
	if (!isAllCaps(t)) return false
	const sibs = siblingEls(el)
	const i = sibs.indexOf(el)
	if (i < 0 || i === sibs.length - 1) return false
	return /^h[1-6]$/.test(sibs[i + 1].tag)
}

/**
 * Is `el` a pill/badge/eyebrow/kicker/section-label? True when EITHER the generalised class pattern
 * matches OR `el` is a structural eyebrow (short all-caps label immediately above a heading).
 */
export function isBadgeEl (el: HNode, classPat: RegExp = BADGE_CLASS_PAT, labelMax: number = EYEBROW_LABEL_MAX): boolean {
	return classMatch(el, classPat) || isStructuralEyebrow(el, labelMax)
}
