/**
 * PptxGenJS — optional utilities entry point (`@jsamuel1/pptxgenjs/utils`).
 *
 * Format-agnostic helpers that are intentionally NOT on the main `PptxGenJS` class, so the
 * core library stays focused on OOXML generation. Import only what you need:
 *
 *   import { extractThemeFromCSS } from '@jsamuel1/pptxgenjs/utils'
 */
export { extractThemeFromCSS } from './utils/extract-theme'
export type { ThemePalette, ExtractThemeOptions } from './utils/extract-theme'
export { parseSvg } from './utils/parse-svg'
export type { SvgPart, ParseSvgOptions } from './utils/parse-svg'
export { parseCards } from './utils/parse-cards'
export type { CardData, ParseCardsOptions } from './utils/parse-cards'
export { parseHtml, query, queryOne, closest, matches, isAncestorOrSelf, textOf, innerTextOf, attr, clone, outerHtml, decodeEntities } from './utils/html-dom'
export type { HNode } from './utils/html-dom'
export { parseTable, parseColumns, parseTimeline, parseQuote, parseBadges, parseCallout } from './utils/parse-content'
export type { TableData, TableCell, ColumnData, TimelineRow, QuoteData, CalloutData, ParseContentOptions } from './utils/parse-content'
export { cssNamedColorToHex } from './utils/css-named-colors'
export { hslToHex, hwbToHex, parseHslString, parseHwbString, extractVarFallback, normalizeColor } from './utils/color-convert'
export { resolveIconFonts, CDN_VERSIONS } from './utils/resolve-icon-fonts'
export type { IconResolveOptions, IconSource, ResolvedSvgPart } from './utils/resolve-icon-fonts'
export { tokenizeCode, codeRuns } from './utils/tokenize-code'
export type { TokenKind, CodeRunsOptions } from './utils/tokenize-code'
export { declOf, gridColumnsOf, flexInfoOf, columnCountOf, sizeOf, parseStyleSheets, cssProp, EMPTY_CSS } from './utils/css-context'
export type { CssContext, ClassRule } from './utils/css-context'
export { resolveFontFiles, readFontName } from './utils/resolve-font-files'
export type { FontFiles, ResolveFontFilesOptions } from './utils/resolve-font-files'
export { measureTextWidth } from './utils/measure-text-width'
export type { MeasureTextWidthOptions } from './utils/measure-text-width'
export { relativeLuminance, contrastRatio, inkForFill } from './gen-utils'
