/**
 * PptxGenJS — bundled icon fallback map (docs/features/feature-icon-font-resolver.md, step 5).
 *
 * A small built-in set of the most common icons so `resolveIconFonts()` still returns useful
 * vector data OFFLINE — with no stylesheets, font files, or network. Each entry is a raw SVG
 * string that is run through `parseSvg()` at resolve time (so the produced `d` is normalised to
 * absolute `M`/`L`/`C`/`Q`/`Z`). The glyph silhouettes are intentionally simplified — this is a
 * last-resort fallback, not a pixel-perfect icon set.
 *
 * Keys:
 *   `fa:<name>`        Font Awesome (solid/regular/brands share the glyph-name space here)
 *   `material:<glyph>` Material Icons / Symbols (keyed by ligature glyph name)
 */

/** Built-in offline icon SVGs, keyed by `<family>:<glyph>`. */
export const BUNDLED_ICONS: Record<string, string> = {
	// Font Awesome — solid trophy ships on the FA 576×512 viewBox.
	'fa:trophy':
		'<svg viewBox="0 0 576 512"><path d="M192 0 L384 0 L384 96 C384 160 340 208 288 224 C236 208 192 160 192 96 Z M264 256 L312 256 L312 416 L392 416 L392 480 L184 480 L184 416 L264 416 Z"/></svg>',
	// Font Awesome — brands GitHub mark (496×512 viewBox).
	'fa:github':
		'<svg viewBox="0 0 496 512"><path d="M248 32 C130 32 32 130 32 248 C32 342 92 422 178 451 C189 453 193 446 193 440 L193 400 C140 411 128 374 128 374 C119 351 105 345 105 345 C88 333 107 333 107 333 C126 334 137 353 137 353 C154 382 183 374 194 369 C196 349 204 336 213 328 C171 323 126 307 126 232 C126 211 134 193 146 180 C144 175 137 155 148 127 C148 127 165 122 193 141 C209 136 227 134 245 134 C263 134 281 136 297 141 C325 122 342 127 342 127 C353 155 346 175 344 180 C356 193 364 211 364 232 C364 307 319 323 277 328 C288 338 297 358 297 388 L297 440 C297 446 301 454 312 451 C398 422 458 342 458 248 C458 130 366 32 248 32 Z"/></svg>',
	// Font Awesome — solid star (576×512 viewBox).
	'fa:star':
		'<svg viewBox="0 0 576 512"><path d="M288 16 L360 190 L548 206 L405 330 L448 514 L288 414 L128 514 L171 330 L28 206 L216 190 Z"/></svg>',
	// Font Awesome — solid bell (448×512 viewBox).
	'fa:bell':
		'<svg viewBox="0 0 448 512"><path d="M224 0 C214 0 208 10 208 22 L208 40 C150 54 112 106 112 168 C112 280 64 320 64 320 L384 320 C384 320 336 280 336 168 C336 106 298 54 240 40 L240 22 C240 10 234 0 224 0 Z M224 512 C250 512 272 490 272 464 L176 464 C176 490 198 512 224 512 Z"/></svg>',
	// Material Icons — home (24×24 viewBox).
	'material:home':
		'<svg viewBox="0 0 24 24"><path d="M12 3 L2 12 L5 12 L5 21 L10 21 L10 14 L14 14 L14 21 L19 21 L19 12 L22 12 Z"/></svg>',
}
