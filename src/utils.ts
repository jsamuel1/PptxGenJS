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
