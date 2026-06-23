// Type definitions for @jsamuel1/pptxgenjs/utils/css
// Tree-shakeable subset of the /utils barrel — CSS-context layout interpreter + theme extractor.
// Re-exported from ./utils (single source of truth) to guarantee parity with the barrel.
export {
	extractThemeFromCSS,
	gridColumnsOf,
	flexInfoOf,
	columnCountOf,
	sizeOf,
	parseStyleSheets,
	cssProp,
	typeDecls,
	EMPTY_CSS,
	bgOfCtx,
	colorOf,
	extractHex,
	transparencyOf,
} from './utils'
export type {
	ThemePalette,
	ExtractThemeOptions,
	CssContext,
	ClassRule,
	TypeRule,
} from './utils'
