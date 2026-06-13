/**
 * PptxGenJS — Icon-font external constants.
 *
 * Single home for the values that track THIRD-PARTY artifacts and therefore change independently
 * of our logic: CDN hosts, pinned package versions, the icon-framework family identifiers we
 * recognise, and the PowerPoint font-face names vendors ship. Bumping a version, swapping a CDN
 * host, or adding a framework is a one-file edit here — and the classifier (`icon-classify`),
 * resolver (`resolve-icon-fonts`) and card parser (`parse-cards`) all read from this file, so they
 * cannot drift on which families they support.
 */

/** Pinned CDN versions for reproducible builds. Bump here when upgrading an icon framework. */
export const CDN_VERSIONS = {
	fa: '6.7.2',
	bi: '1.11.3',
	ion: '7.4.0',
} as const

/** Font-Awesome glyph style — selects the CDN sub-path and the matching PowerPoint font-face. */
export type FaStyle = 'solid' | 'regular' | 'brands'

/** CDN URL for a Font-Awesome glyph SVG (raw GitHub, pinned to {@link CDN_VERSIONS}.fa). */
export function faCdnUrl (style: FaStyle, glyphName: string): string {
	return `https://raw.githubusercontent.com/FortAwesome/Font-Awesome/${CDN_VERSIONS.fa}/svgs/${style}/${glyphName}.svg`
}

/** CDN URL for a Bootstrap Icons glyph SVG (jsDelivr, pinned to {@link CDN_VERSIONS}.bi). */
export function biCdnUrl (glyphName: string): string {
	return `https://cdn.jsdelivr.net/npm/bootstrap-icons@${CDN_VERSIONS.bi}/icons/${glyphName}.svg`
}

/** CDN URL for an Ionicons glyph SVG (unpkg, pinned to {@link CDN_VERSIONS}.ion). */
export function ionCdnUrl (glyphName: string): string {
	return `https://unpkg.com/ionicons@${CDN_VERSIONS.ion}/dist/svg/${glyphName}.svg`
}

/** Icon-font families we explicitly recognise (gates genuine icons from generic classed elements). */
export const ICON_FAMILIES: ReadonlySet<string> = new Set([
	'fa', 'bi', 'ph', 'ion', 'icon',
	'material-icons', 'material-symbols', 'material-icons-outlined', 'material-symbols-outlined',
])

/** Material ligature families that map to the "Material Icons" PowerPoint font-face. */
export const MATERIAL_FONT_FACE_FAMILIES: ReadonlySet<string> = new Set([
	'material-icons', 'material-symbols-outlined', 'material-icons-outlined',
])

/** Font-Awesome class tokens that are STYLE/utility modifiers, not glyph names. */
export const FA_MODIFIERS: ReadonlySet<string> = new Set([
	'solid', 'regular', 'brands', 'light', 'thin', 'duotone', 'sharp', 'fw', 'lg', 'sm', 'xs',
	'spin', 'pulse', 'border', 'inverse', 'stack', 'stack-1x', 'stack-2x', 'li', 'rotate-90',
	'rotate-180', 'rotate-270', 'flip-horizontal', 'flip-vertical', '2x', '3x', '4x', '5x',
])

/** PowerPoint font-face names per icon framework (vendor names; version-tied for Font Awesome). */
export const ICON_FONT_FACES = {
	faBrands: 'Font Awesome 6 Brands',
	faRegular: 'Font Awesome 6 Free Regular',
	faSolid: 'Font Awesome 6 Free Solid',
	faDefault: 'Font Awesome 6 Free',
	bi: 'Bootstrap Icons',
	ph: 'Phosphor',
	ion: 'Ionicons',
	material: 'Material Icons',
} as const
