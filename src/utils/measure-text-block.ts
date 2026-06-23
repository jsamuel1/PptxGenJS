/**
 * PptxGenJS — wrapped-text block measurer (built on {@link measureTextWidth}).
 *
 * `measureTextBlock(text, opts)` estimates how a run of text wraps inside a box of width
 * `opts.maxWidthIn` (inches) at `opts.fontSize` points, returning the wrapped **line count**,
 * the widest line **width** (inches), and the total **height** (inches). It is the vertical/fit
 * companion to `measureTextWidth` — useful for overflow detection and picking a fit font size.
 *
 * Wrapping is GREEDY word-wrap: words are accumulated onto the current line until the next word
 * would exceed `maxWidthIn`, then a new line starts. Explicit `\n` (and `\r\n`/`\r`) always force
 * a new line. A single word wider than the box still occupies one line (it never disappears).
 * All widths come from `measureTextWidth`, so the measure is Unicode-block-aware: CJK/fullwidth
 * glyphs (≈ 1.0 em) wrap sooner than the same count of Latin glyphs (≈ 0.5 em).
 *
 * Pure, deterministic, DOM-free. `heightIn = lines * fontSize * lineHeight / 72`.
 */
import { measureTextWidth, MeasureTextWidthOptions } from './measure-text-width'

/** Options for {@link measureTextBlock}. */
export interface MeasureTextBlockOptions {
	/** Font size in points (required). */
	fontSize: number
	/** Available width for the block, in **inches** (required). Word-wrap target. */
	maxWidthIn: number
	/**
	 * Advisory font-family name. The underlying measurement is family-agnostic in its fallback
	 * path; supply `fontFile` to drive per-glyph metrics. Accepted for forward compatibility and
	 * caller bookkeeping — it does not by itself change the measurement.
	 */
	fontFamily?: string
	/** Path to a TTF/OTF/TTC font file — forwarded to {@link measureTextWidth} for exact metrics. */
	fontFile?: string
	/** Line-height multiple applied to `fontSize` for the height. @default 1.2 */
	lineHeight?: number
	/** Bold weight hint. Reserved for future metric refinement; does not change the result today. */
	bold?: boolean
}

/** Result of {@link measureTextBlock}. */
export interface MeasureTextBlockResult {
	/** Number of wrapped lines (≥ 1 for any input, including the empty string). */
	lines: number
	/** Width of the widest wrapped line, in **inches**. */
	widthIn: number
	/** Total block height, in **inches** (`lines * fontSize * lineHeight / 72`). */
	heightIn: number
}

/** Split on explicit line breaks (`\r\n`, `\r`, `\n`) — honoured before word-wrap. */
function splitHardLines(text: string): string[] {
	return text.split(/\r\n|\r|\n/)
}

/** Split a hard line into wrappable tokens, preserving runs of whitespace as separators. */
function splitWords(line: string): string[] {
	// Keep it simple and Unicode-safe: collapse to words separated by any whitespace.
	const trimmed = line.replace(/\s+/g, ' ').trim()
	return trimmed.length === 0 ? [] : trimmed.split(' ')
}

/**
 * Greedily word-wrap one hard line, returning the wrapped line texts. Never returns `[]` —
 * an empty/whitespace-only hard line yields a single empty line (it still occupies vertical space).
 */
function wrapHardLine(line: string, maxWidthIn: number, mtwOpts: MeasureTextWidthOptions): string[] {
	const words = splitWords(line)
	if (words.length === 0) return ['']

	const out: string[] = []
	let current = ''

	for (const word of words) {
		const candidate = current === '' ? word : current + ' ' + word
		if (current !== '' && measureTextWidth(candidate, mtwOpts) > maxWidthIn) {
			// Candidate overflows → flush current line and start a new one with this word.
			out.push(current)
			current = word
		} else {
			current = candidate
		}
	}
	out.push(current)
	return out
}

/**
 * Estimate wrapped line count, widest-line width, and total height for `text` inside a box of
 * width `opts.maxWidthIn` inches at `opts.fontSize` points.
 *
 * - Greedy word-wrap against `maxWidthIn` using {@link measureTextWidth} (Unicode-block-aware).
 * - Explicit `\n` (and `\r\n`/`\r`) force a new line.
 * - A single word wider than the box still occupies exactly one line.
 * - `maxWidthIn` ≤ 0 is treated as "no wrapping" (each hard line is one line) — never divides by zero.
 * - `heightIn = lines * fontSize * (lineHeight ?? 1.2) / 72`.
 *
 * The empty string returns `{ lines: 1, widthIn: 0, heightIn: oneLineHeight }` — an empty box still
 * reserves one line of vertical space.
 */
export function measureTextBlock(text: string, opts: MeasureTextBlockOptions): MeasureTextBlockResult {
	const fontSize = opts.fontSize > 0 ? opts.fontSize : 12
	const lineHeight = opts.lineHeight !== undefined && opts.lineHeight > 0 ? opts.lineHeight : 1.2
	const maxWidthIn = opts.maxWidthIn

	const mtwOpts: MeasureTextWidthOptions = { fontSize }
	if (opts.fontFile) mtwOpts.fontFile = opts.fontFile

	let lines = 0
	let widthIn = 0

	for (const hardLine of splitHardLines(text)) {
		// maxWidthIn ≤ 0 (or non-finite) ⇒ no wrapping: the hard line is a single line.
		const wrapped = maxWidthIn > 0 ? wrapHardLine(hardLine, maxWidthIn, mtwOpts) : [hardLine]
		for (const wl of wrapped) {
			lines += 1
			const w = measureTextWidth(wl, mtwOpts)
			if (w > widthIn) widthIn = w
		}
	}

	if (lines === 0) lines = 1  // defensive — splitHardLines always yields ≥1, but never return 0 lines

	return { lines, widthIn, heightIn: (lines * fontSize * lineHeight) / 72 }
}
