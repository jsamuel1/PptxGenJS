/**
 * PptxGenJS — `/utils/icons` sub-path entry.
 *
 * Tree-shakeable subset of `@jsamuel1/pptxgenjs/utils` covering icon-font resolution and
 * code tokenisation: `resolveIconFonts` (+ `CDN_VERSIONS`) and `tokenizeCode`/`codeRuns`.
 *
 *   import { resolveIconFonts, codeRuns } from '@jsamuel1/pptxgenjs/utils/icons'
 *
 * The full barrel (`@jsamuel1/pptxgenjs/utils`) re-exports everything here unchanged.
 */
export { resolveIconFonts, CDN_VERSIONS } from './utils/resolve-icon-fonts'
export type { IconResolveOptions, IconSource, ResolvedSvgPart } from './utils/resolve-icon-fonts'
export { tokenizeCode, codeRuns } from './utils/tokenize-code'
export type { TokenKind, CodeRunsOptions } from './utils/tokenize-code'
