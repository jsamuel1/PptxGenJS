# 0008 — Remove the bundled `icons-fa` pack (breaking, next major)

> **Status:** Accepted (2026-06-13) — maintainer direction; breaking changes
> explicitly approved.

## Context

4.3.15 shipped an opt-in `@jsamuel1/pptxgenjs/icons-fa` subpath export (~1 MB of
Font Awesome path data, 2,956 icons), a build-time generator, `subsetIconPack()`
on `/utils`, and a `resolveIconFonts({pack})` layer. Its purpose was to absorb the
downstream html-to-pptx converter's local icon pack.

That purpose evaporated: the converter adopted the **fetch-not-bundle** direction
(its `feature-runtime-icon-font-cache.md` — assets download at use time via the
Quick agent layer and cache in the skills directory). No consumer of the library
entry exists or is planned. Meanwhile the entry carries real costs: CC BY 4.0
attribution obligations on the npm artifact (still unmet at 4.3.17), brand-icon
trademark caveats, a curated-ranking dataset to maintain, generator + parity +
size-budget upkeep, and ~1 MB of install weight.

## Decision

Remove the feature entirely in the next **major** release:

- Delete `src/icons-fa.ts`, the generated data module, `types/icons-fa.d.ts`, the
  `./icons-fa` exports-map entry, the rollup icons-fa output, the generator script
  and its curated-ranking dataset, and the `@fortawesome/fontawesome-free`
  devDependency.
- Remove `subsetIconPack` from `/utils` (export, typings, tests) — it exists only
  to subset the pack.
- Remove the `pack` layer from `resolveIconFonts` (revert to
  customResolver → bundled → CDN). `bundled-icons.ts` and the generic
  `iconResolver` hook on `parseCards` are untouched — vector icon *conversion*
  remains a library capability; icon *data distribution* does not.
- CHANGELOG `### Removed` entries; ship as the next major bump per RELEASING.md.

## Consequences

- Consumers needing offline icon data supply their own pack via the existing
  generic hooks (`iconResolver`, `resolveIconFonts`'s custom resolver) — data
  stays with the consumer, licensing stays with the consumer.
- The library's CC BY redistribution question disappears; README attribution work
  is moot.
- `feature-icon-pack-entry.md` is tombstoned (Superseded — removed); its open
  findings 4–6 are closed as moot.
- Re-proposing a bundled icon pack without new evidence (an actual consumer that
  cannot fetch) is an intent deviation per AGENTS.md.
