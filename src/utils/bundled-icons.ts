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
export const BUNDLED_ICONS: Record<string, string> = {}
