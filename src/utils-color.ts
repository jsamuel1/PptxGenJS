/**
 * PptxGenJS — `/utils/color` sub-path entry.
 *
 * Tree-shakeable subset of `@jsamuel1/pptxgenjs/utils` covering colour conversion and
 * contrast helpers: `normalizeColor`, `cssNamedColorToHex`, and the WCAG luminance/contrast/
 * ink helpers.
 *
 *   import { normalizeColor, contrastRatio } from '@jsamuel1/pptxgenjs/utils/color'
 *
 * The full barrel (`@jsamuel1/pptxgenjs/utils`) re-exports everything here unchanged.
 */
export { cssNamedColorToHex } from './utils/css-named-colors'
export { normalizeColor } from './utils/color-convert'
export { relativeLuminance, contrastRatio, inkForFill } from './gen-utils'
