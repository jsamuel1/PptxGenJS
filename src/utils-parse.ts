/**
 * PptxGenJS — `/utils/parse` sub-path entry.
 *
 * Tree-shakeable subset of `@jsamuel1/pptxgenjs/utils` covering the HTML structural
 * recognisers and the dependency-free HTML DOM: card grids, content blocks
 * (tables/columns/timelines/quotes/badges/callouts/tiles), SVG paths, images, and the
 * `parseHtml`/query primitives they share. Import only this to drop the theme/color/measure
 * extractors from a consumer bundle:
 *
 *   import { parseCards, parseTable, parseSvg } from '@jsamuel1/pptxgenjs/utils/parse'
 *
 * The full barrel (`@jsamuel1/pptxgenjs/utils`) re-exports everything here unchanged.
 */
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
