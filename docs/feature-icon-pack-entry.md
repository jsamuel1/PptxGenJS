# Feature: `icons-fa` subpath export — shared Font Awesome icon pack

> **Status:** Proposed
> **Priority:** High (dedupes a 400 KB generated pack + generator script currently
> maintained downstream in html-to-pptx; benefits every consumer of `parseCards`
> `iconResolver` and `resolveIconFonts`)

## Problem

Icon vector data is maintained in the wrong place, twice over:

- This library's offline icon layer (`src/utils/bundled-icons.ts`) carries **5** icons,
  so `resolveIconFonts()`'s offline-first story is effectively empty.
- The html-to-pptx converter compensates by generating and committing its own pack
  (`scripts/generate-icon-pack.js` → `src/icon-pack-fa.js`, ~1,058 icons / 400 KB,
  subset by an ad-hoc budget heuristic) — downstream-local infrastructure that any
  other consumer of this library would have to reinvent.

## Proposal

Ship the pack from the library as an **opt-in subpath export** that is never part of
the main bundles:

1. **`@jsamuel1/pptxgenjs/icons-fa`** — a generated CommonJS/ESM data module mapping
   `fa-<name>` → `{ w, h, d }` for the **full FA Free set** (Solid + Regular + Brands,
   distinct keys per style where names collide, FA5→FA6+ aliases included). Generated
   at library build time from `@fortawesome/fontawesome-free` (devDependency only);
   committed output with an idempotent generator, CC BY 4.0 attribution in the file
   header and README. npm install size is the only cost (~1 MB raw); the main
   `pptxgen.*` bundles must not grow by a byte (API-parity/bundle tests guard this).
2. **`subsetIconPack(pack, opts)`** — exported from `/utils`: deterministic subsetting
   for size-budgeted consumers. `opts: { include?: string[], budget?: number,
   rank?: (name) => number }` with rank defaulting to FA's own popularity metadata
   (bundled at generation time), NOT name/path-length heuristics. Returns a new pack
   object; consumers serialise it themselves (e.g. html-to-pptx writes its bundled
   subset at build time and deletes its local generator + fontawesome devDependency).
3. **Wire into the existing icon layer**: `resolveIconFonts()` accepts
   `{ pack }` (or auto-uses the entry when resolvable) so offline resolution covers
   the full set; `bundled-icons.ts` becomes a thin re-export or is deleted.

## Affected files

- `scripts/generate-fa-pack.js` (new, generator — port from html-to-pptx's
  `scripts/generate-icon-pack.js`, replacing its path-length budget heuristic with
  popularity metadata)
- `src/icons-fa.ts` or generated `icons-fa.js` + `types/icons-fa.d.ts` + package.json
  `exports` map entry
- `src/utils/subset-icon-pack.ts` (new) + `/utils` export + `types/utils.d.ts`
- `src/utils/resolve-icon-fonts.ts` (accept injected pack)
- `rollup.config.mjs` (new entry; main bundles unchanged)

## Acceptance criteria

1. `require('@jsamuel1/pptxgenjs/icons-fa')['fa-anchor']` returns `{w,h,d}` —
   including icons the downstream heuristic dropped (`fa-anchor`, `fa-address-book`).
2. Main bundle sizes byte-identical before/after (the pack is reachable only via the
   subpath).
3. API parity test extended to the new entry's typings.
4. `subsetIconPack(pack, { budget: 400_000, include: [...] })` is deterministic,
   always honours `include`, and orders the remainder by popularity rank.
5. Generator is idempotent (regeneration produces a clean tree) and licence
   attribution is present in the generated header and README.
6. Downstream proof: html-to-pptx can delete `scripts/generate-icon-pack.js` and its
   `@fortawesome/fontawesome-free` devDependency, building its bundled subset from
   this entry instead, with its FA test suite still green.

## Coordination

The converter keeps its local pack until this ships in a release; its loop has a task
to migrate and delete the local generator once available. Do not implement this before
the reopened css-context Slice 4 findings are closed and released.
