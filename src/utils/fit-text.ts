/**
 * PptxGenJS — shrink-to-fit font sizer (built on {@link measureTextBlock}).
 *
 * `fitFontSize(text, opts)` finds the LARGEST font size (in points) at which `text`, word-wrapped
 * to a box of width `opts.boxWidthIn` inches, has a measured block height (`measureTextBlock(...)
 * .heightIn`) that is ≤ `opts.boxHeightIn`. It is the "auto-shrink" companion to `measureTextBlock`
 * — useful when a converter must drop a paragraph's font size until it fits its placeholder.
 *
 * The search runs over a discrete grid from `opts.minFontSize` (default 8) up to `opts.maxFontSize`
 * in `opts.step` increments (default 0.5pt — PowerPoint's font-size granularity; integers if `step`
 * is 1). It returns the largest grid point that fits; if even `minFontSize` overflows the box, it
 * returns `{ fontSize: minFontSize, fits: false }` so the caller can decide to truncate/paginate.
 *
 * Pure, deterministic, DOM-free, dependency-free (only {@link measureTextBlock} + math). Guards
 * `boxWidthIn <= 0` / `boxHeightIn <= 0` and degenerate step/range inputs — never loops forever or
 * divides by zero.
 */
import { measureTextBlock } from './measure-text-block'

/** Options for {@link fitFontSize}. */
export interface FitFontSizeOptions {
	/** Box width, in **inches** — the word-wrap target handed to `measureTextBlock`. */
	boxWidthIn: number
	/** Box height, in **inches** — the block must measure ≤ this to "fit". */
	boxHeightIn: number
	/** Largest font size (points) to consider. The search never returns a larger size. */
	maxFontSize: number
	/** Smallest font size (points) to consider. @default 8 */
	minFontSize?: number
	/** Advisory font-family name — forwarded to `measureTextBlock` for caller bookkeeping. */
	fontFamily?: string
	/** Line-height multiple forwarded to `measureTextBlock`. @default 1.2 */
	lineHeight?: number
	/** Bold weight hint forwarded to `measureTextBlock`. */
	bold?: boolean
	/** Font-size grid step, in points. @default 0.5 */
	step?: number
}

/** Result of {@link fitFontSize}. */
export interface FitFontSizeResult {
	/** Chosen font size, in points — the largest grid point that fits, or `minFontSize` if none fit. */
	fontSize: number
	/** Wrapped line count at the chosen `fontSize` (from `measureTextBlock`). */
	lines: number
	/** Measured block height at the chosen `fontSize`, in **inches**. */
	heightIn: number
	/** True when the chosen `fontSize` actually fits the box (`heightIn <= boxHeightIn`). */
	fits: boolean
}

/** Build the `measureTextBlock` options for a candidate font size. */
function blockOpts(fontSize: number, opts: FitFontSizeOptions) {
	const o: {
		fontSize: number
		maxWidthIn: number
		fontFamily?: string
		lineHeight?: number
		bold?: boolean
	} = { fontSize, maxWidthIn: opts.boxWidthIn }
	if (opts.fontFamily !== undefined) o.fontFamily = opts.fontFamily
	if (opts.lineHeight !== undefined) o.lineHeight = opts.lineHeight
	if (opts.bold !== undefined) o.bold = opts.bold
	return o
}

/**
 * Pick the LARGEST font size in `[minFontSize ?? 8, maxFontSize]` (on a `step`-sized grid) at which
 * `text` word-wrapped to `opts.boxWidthIn` measures ≤ `opts.boxHeightIn` tall.
 *
 * - Descending scan over the grid; the first (largest) candidate that fits is returned with
 *   `fits: true`.
 * - If even `minFontSize` overflows the box, returns `{ fontSize: minFontSize, fits: false, ... }`
 *   (the measurement is at `minFontSize`) — the caller decides whether to truncate or paginate.
 * - If `maxFontSize` already fits, it is returned (`fits: true`).
 * - Degenerate inputs are guarded: a non-finite/≤0 `step` falls back to 0.5; `minFontSize` is clamped
 *   to ≥ 0 and to ≤ `maxFontSize` (a min above max collapses to a single candidate at `maxFontSize`);
 *   a `boxWidthIn <= 0` is passed through to `measureTextBlock` (treated there as "no wrapping").
 *   Never loops forever and never divides by zero.
 */
export function fitFontSize(text: string, opts: FitFontSizeOptions): FitFontSizeResult {
	const maxFontSize = opts.maxFontSize
	// Clamp min into [0, maxFontSize]. A caller-supplied min above max collapses to {max}.
	let minFontSize = opts.minFontSize !== undefined ? opts.minFontSize : 8
	if (!(minFontSize >= 0)) minFontSize = 0 // also catches NaN
	if (minFontSize > maxFontSize) minFontSize = maxFontSize
	// step must be a positive finite number, else fall back to the PowerPoint-granular default.
	const step = opts.step !== undefined && opts.step > 0 && Number.isFinite(opts.step) ? opts.step : 0.5

	// Build the descending grid: maxFontSize, maxFontSize-step, … down to (and including) minFontSize.
	// Cap the iteration count defensively so a pathological range can never loop forever.
	const span = maxFontSize - minFontSize
	const steps = span > 0 ? Math.floor(span / step + 1e-9) : 0
	const maxIters = 100000

	let best: FitFontSizeResult | null = null
	for (let i = 0; i <= steps && i <= maxIters; i++) {
		const candidate = maxFontSize - i * step
		// Guard against floating drift carrying us below the floor.
		const size = candidate < minFontSize ? minFontSize : candidate
		const m = measureTextBlock(text, blockOpts(size, opts))
		if (m.heightIn <= opts.boxHeightIn) {
			best = { fontSize: size, lines: m.lines, heightIn: m.heightIn, fits: true }
			break
		}
		if (size === minFontSize) break // reached the floor without fitting
	}

	if (best) return best

	// Nothing on the grid fit (or span was 0 and max didn't fit) → report the floor, fits:false.
	const floor = measureTextBlock(text, blockOpts(minFontSize, opts))
	return {
		fontSize: minFontSize,
		lines: floor.lines,
		heightIn: floor.heightIn,
		fits: floor.heightIn <= opts.boxHeightIn,
	}
}
