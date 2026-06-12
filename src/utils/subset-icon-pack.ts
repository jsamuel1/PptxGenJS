/**
 * Subset an icon pack to stay within a byte-budget.
 *
 * Given a full icon pack (e.g. Font Awesome), returns a new object containing
 * only the most important icons that fit within the specified JSON byte budget.
 */

/** Options for {@link subsetIconPack}. */
export interface SubsetIconPackOptions {
	/** Icon names that MUST appear in the output regardless of budget. */
	include?: string[]
	/** Maximum `JSON.stringify` byte-length of the returned object. */
	budget?: number
	/** Custom ranking function (higher = more important). Defaults to `entry.popularity ?? 0`. */
	rank?: (name: string, entry: { w: number; h: number; d: string; popularity?: number }) => number
}

/**
 * Return a subset of `pack` that fits within a JSON byte budget.
 *
 * - Always includes entries listed in `opts.include` (they consume budget but are never cut).
 * - Remaining entries are sorted by rank descending; ties broken alphabetically by name.
 * - Entries are added greedily until the next entry would exceed `budget`.
 * - Output entries contain only `{ w, h, d }` (strips `popularity`).
 * - Never mutates the input `pack`.
 */
export function subsetIconPack(
	pack: Record<string, { w: number; h: number; d: string; popularity?: number }>,
	opts?: SubsetIconPackOptions
): Record<string, { w: number; h: number; d: string }> {
	const include = opts?.include ?? []
	const budget = opts?.budget
	const rankFn = opts?.rank ?? ((_name: string, entry: { popularity?: number }) => entry.popularity ?? 0)

	const result: Record<string, { w: number; h: number; d: string }> = {}

	// Always include forced entries first
	for (const name of include) {
		if (name in pack) {
			const { w, h, d } = pack[name]
			result[name] = { w, h, d }
		}
	}

	// If no budget, return all entries (stripped of popularity)
	if (budget === undefined) {
		for (const name of Object.keys(pack)) {
			if (!(name in result)) {
				const { w, h, d } = pack[name]
				result[name] = { w, h, d }
			}
		}
		return result
	}

	// Collect remaining candidates (not in include list)
	const includeSet = new Set(include)
	const candidates = Object.keys(pack)
		.filter(name => !includeSet.has(name))
		.map(name => ({ name, rank: rankFn(name, pack[name]) }))

	// Sort: rank descending, then name ascending for determinism
	candidates.sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))

	// Greedily add until budget exceeded
	for (const { name } of candidates) {
		const { w, h, d } = pack[name]
		const trial = { ...result, [name]: { w, h, d } }
		if (JSON.stringify(trial).length > budget) break
		result[name] = { w, h, d }
	}

	return result
}
