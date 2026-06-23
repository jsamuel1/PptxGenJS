// Type definitions for @jsamuel1/pptxgenjs/utils/icons
// Tree-shakeable subset of the /utils barrel — icon-font resolution + code tokenisation.
// Re-exported from ./utils (single source of truth) to guarantee parity with the barrel.
export {
	resolveIconFonts,
	CDN_VERSIONS,
	tokenizeCode,
	codeRuns,
} from './utils'
export type {
	IconResolveOptions,
	IconSource,
	ResolvedSvgPart,
	TokenKind,
	CodeRunsOptions,
} from './utils'
