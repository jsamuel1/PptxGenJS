/**
 * PptxGenJS — `/utils/measure` sub-path entry.
 *
 * Tree-shakeable subset of `@jsamuel1/pptxgenjs/utils` covering text measurement and
 * shrink-to-fit: `measureTextWidth`, `measureTextBlock`, `fitFontSize`, and the font-file
 * resolver they pair with.
 *
 *   import { measureTextBlock, fitFontSize } from '@jsamuel1/pptxgenjs/utils/measure'
 *
 * The full barrel (`@jsamuel1/pptxgenjs/utils`) re-exports everything here unchanged.
 */
export { resolveFontFiles, readFontName } from './utils/resolve-font-files'
export type { FontFiles, ResolveFontFilesOptions } from './utils/resolve-font-files'
export { measureTextWidth } from './utils/measure-text-width'
export type { MeasureTextWidthOptions } from './utils/measure-text-width'
export { measureTextBlock } from './utils/measure-text-block'
export type { MeasureTextBlockOptions, MeasureTextBlockResult } from './utils/measure-text-block'
export { fitFontSize } from './utils/fit-text'
export type { FitFontSizeOptions, FitFontSizeResult } from './utils/fit-text'
