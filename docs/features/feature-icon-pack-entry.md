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

## Review findings (2026-06-12) — fix before flipping status / releasing 4.3.15

> **Closure status (2026-06-13, verified by execution at 4.3.17) — findings 1–3 are
> CLOSED, do not re-plan them:**
> 1 (fake ranking) fixed in `cdcfcf6c` — curated common-icon list; verified: an 8 KB
> default subset is `fa-user, far-user, fa-check, fa-home…`;
> 2 (export shape) fixed in `8403d310` — verified `require('…/icons-fa')['fa-anchor']`
> resolves;
> 3 (style-blind lookup) fixed in `bbfdd6d4` — style-prefixed keys consulted in
> resolve-icon-fonts.ts.
> **Still open:** 4 (README CC BY attribution — absent at 4.3.17; the CHANGELOG halves
> were rolled into the 4.3.16/4.3.17 release sections), 5 (parity/coverage for the
> icons-fa entry's typings ↔ runtime), 6 (subsetIconPack O(n²) + artifact churn — low).
> Scope note: html-to-pptx no longer consumes this entry (fetch-not-bundle direction —
> see its feature-runtime-icon-font-cache.md); the remainder is standalone-library
> hygiene, weigh effort accordingly.

Independent review of the implementation (commits 1f9cc68b, a60fadd8, 8c24a74e,
3a60bae7; all claims below verified by execution). AC2 (main bundles byte-identical)
and AC7 wiring default-off are **met**; the items below are the fix contract:

1. **HIGH — fake popularity ranking (AC4/AC6 violated).** `loadPopularity()` in
   `scripts/generate-fa-pack.js` assigns reverse YAML-position — i.e.
   reverse-alphabetical — as "popularity" (FA's `metadata/icons.yml` has no popularity
   field). Executed: an 8 KB default subset is `fa-0…fa-9, fa-42-group, fa-500px,
   fa-a, …` — zero common icons; `fa-user` ranks 2077/2956. This re-creates the
   rejected-heuristic problem alphabetically and makes a default 400 KB downstream
   subset DROP `fa-user`/`fa-check`. Fix: a real ranking source (FA vote/usage data
   committed alongside, or a curated common-icon list), or fail loudly when no rank is
   supplied — never fabricate. Add a regression test: `fa-user` and `fa-check` survive
   a 400 KB default subset.
2. **MEDIUM — export shape misses AC1's literal contract.**
   `require('@jsamuel1/pptxgenjs/icons-fa')['fa-anchor']` is `undefined`; only
   `.FA_ICONS['fa-anchor']` works (the barrel drops the generated default export).
   Either flatten/re-export default, or amend AC1 — then add a smoke test importing
   the built `src/bld/icons-fa.cjs.js` (currently NO test imports the entry).
3. **MEDIUM — pack lookup ignores style classes.** `resolve-icon-fonts.ts` builds
   `fa-${glyphName}` for every FA style, so the pack's `far-*`/`fab-*` keys are never
   consulted — `<i class="far fa-user">` silently resolves to the Solid path. Make the
   lookup style-aware (`far`/`fab` tokens → `far-`/`fab-` keys, `fa-` fallback).
4. **MEDIUM — no CHANGELOG entries** for any of the four commits (`[Unreleased]` is
   empty); **README CC BY 4.0 attribution missing** (AC5 second half — header has it,
   README does not).
5. **LOW-MEDIUM — parity/coverage gap (AC3).** The API parity test reads only
   `types/utils.d.ts`; extend it (or add a sibling check) to the icons-fa entry's
   typings ↔ runtime.
6. **LOW — artifact churn**: 3a60bae7 committed `demos/browser/js/pptxgen.bundle.js`
   banner churn unrelated to its change. **LOW — `subsetIconPack` is O(n²)**
   (re-serializes the growing result per candidate); rewrite with a running byte count.

Status stays **Proposed** until 1–5 are closed; AC6 (downstream proof) follows the
4.3.15 release and the converter migration. Test/lint baseline at review time:
463 + 74 passing, Failed: 0.
