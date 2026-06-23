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
export { parseTable, parseColumns, parseTimeline, parseQuote, parseBadges, parseCallout, parseTiles } from './utils/parse-content'
export type { TableData, TableCell, ColumnData, TimelineRow, QuoteData, BadgeData, CalloutData, TileData, ParseContentOptions } from './utils/parse-content'
export { parseImages } from './utils/parse-image'
export type { ImageNode, ParseImageOptions } from './utils/parse-image'
export { cssNamedColorToHex } from './utils/css-named-colors'
export { normalizeColor } from './utils/color-convert'
export { resolveIconFonts, CDN_VERSIONS } from './utils/resolve-icon-fonts'
export type { IconResolveOptions, IconSource, ResolvedSvgPart } from './utils/resolve-icon-fonts'
export { tokenizeCode, codeRuns } from './utils/tokenize-code'
export type { TokenKind, CodeRunsOptions } from './utils/tokenize-code'
export { gridColumnsOf, flexInfoOf, columnCountOf, sizeOf, parseStyleSheets, cssProp, typeDecls, EMPTY_CSS, bgOfCtx, colorOf, extractHex, transparencyOf } from './utils/css-context'
export type { CssContext, ClassRule, TypeRule } from './utils/css-context'
export { resolveFontFiles, readFontName } from './utils/resolve-font-files'
export type { FontFiles, ResolveFontFilesOptions } from './utils/resolve-font-files'
export { measureTextWidth } from './utils/measure-text-width'
export type { MeasureTextWidthOptions } from './utils/measure-text-width'
export { measureTextBlock } from './utils/measure-text-block'
export type { MeasureTextBlockOptions, MeasureTextBlockResult } from './utils/measure-text-block'
export { fitFontSize } from './utils/fit-text'
export type { FitFontSizeOptions, FitFontSizeResult } from './utils/fit-text'
export { relativeLuminance, contrastRatio, inkForFill } from './gen-utils'
