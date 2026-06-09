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
export { parseHtml, query, queryOne, closest, matches, textOf, attr, clone, outerHtml } from './utils/html-dom'
export type { HNode } from './utils/html-dom'
export { parseTable, parseColumns } from './utils/parse-content'
export type { TableData, TableCell, ColumnData, ParseContentOptions } from './utils/parse-content'
export { resolveIconFonts } from './utils/resolve-icon-fonts'
export type { IconResolveOptions, IconSource, ResolvedSvgPart } from './utils/resolve-icon-fonts'
