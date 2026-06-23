// Type definitions for @jsamuel1/pptxgenjs/utils/measure
// Tree-shakeable subset of the /utils barrel — text measurement, shrink-to-fit, font-file resolver.
// Re-exported from ./utils (single source of truth) to guarantee parity with the barrel.
export {
	resolveFontFiles,
	readFontName,
	measureTextWidth,
	measureTextBlock,
	fitFontSize,
} from './utils'
export type {
	FontFiles,
	ResolveFontFilesOptions,
	MeasureTextWidthOptions,
	MeasureTextBlockOptions,
	MeasureTextBlockResult,
	FitFontSizeOptions,
	FitFontSizeResult,
} from './utils'
