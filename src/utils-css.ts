/**
 * PptxGenJS — `/utils/css` sub-path entry.
 *
 * Tree-shakeable subset of `@jsamuel1/pptxgenjs/utils` covering the CSS-context layout
 * interpreter and the CSS theme extractor: `parseStyleSheets`, the cascade-aware property
 * resolvers, and `extractThemeFromCSS`.
 *
 *   import { extractThemeFromCSS, parseStyleSheets } from '@jsamuel1/pptxgenjs/utils/css'
 *
 * The full barrel (`@jsamuel1/pptxgenjs/utils`) re-exports everything here unchanged.
 */
export { extractThemeFromCSS } from './utils/extract-theme'
export type { ThemePalette, ExtractThemeOptions } from './utils/extract-theme'
export { gridColumnsOf, flexInfoOf, columnCountOf, sizeOf, parseStyleSheets, cssProp, typeDecls, EMPTY_CSS, bgOfCtx, colorOf, extractHex, transparencyOf } from './utils/css-context'
export type { CssContext, ClassRule, TypeRule } from './utils/css-context'
