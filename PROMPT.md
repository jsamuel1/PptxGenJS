# PptxGenJS Fork — Work Plan

> **Audience:** A developer (or agent) implementing fixes and features in this
> fork (`github.com/jsamuel1/PptxGenJS`). This is the actionable, ordered work
> plan. It supersedes the old feature-tracker. Status of the format surface
> lives in [`docs/FEATURE-MATRIX.md`](docs/FEATURE-MATRIX.md); this document is
> the *execution order*.
>
> **Prime directive:** Work top to bottom. **Phase 0 (make the suite green)
> must be completed and committed before any Phase 1+ feature work begins.**

---

## Ground rules (apply to every task)

> **Read first, every run:** [CONTRIBUTING.md](./CONTRIBUTING.md) (spec lifecycle,
> definition of done for public APIs, git staging discipline),
> [TESTING.md → Automated test conventions](./TESTING.md#automated-test-conventions-all-contributions),
> and [RELEASING.md → Release gates](./RELEASING.md#release-gates-before-any-version-bump).
> Those documents are the canonical contribution rules and prevail over this list on
> conflict; the numbered rules below are the task-execution subset. In particular:
> stage commits explicitly by path (never `git add -A`/`commit -a`), never cut a
> release in the same iteration that implemented the feature, and a spec is only
> "Implemented" once its stated consumer can actually use it.

1. **Local files are the source of truth.** Read `src/*.ts` before changing it.
   Do not copy implementations from upstream or the web.
2. **Schema-validate everything.** Every emitted change must pass
   `npm run schema-test` (OpenXML validator). New behavior gets a new fixture
   in `test/schema.test.js`; new logic gets a regression test in
   `test/feature-*.test.js`.
3. **Default-off invariant.** A presentation that does not use a feature must
   emit byte-for-byte identical XML to before the feature existed. Guard every
   new emit behind an explicit opt-in.
4. **Clamp, don't crash.** Out-of-range numeric inputs must be clamped to the
   valid OOXML range (see Phase 0), never emitted verbatim and never thrown on.
5. **Verify before commit:** `npm run build` → `npm test` → `npm run lint`
   (0 errors) → `npm run ship` (artifacts) must all pass. `npm test` must end
   `Failed: 0` on both suites.
6. **Commit discipline:** one logical change per commit, Conventional Commits
   style. Do not commit unrelated WIP. Do not commit `dist/` churn unless the
   change is a release.
7. **Copy fidelity is sacred** (see matrix Scope note): never strip unknown
   parts/relationships/XML when round-tripping; "unsupported to author" never
   means "safe to drop."
8. **Keep docs + CHANGELOG current — in the same commit as the change.**
   Every behavior change updates, as part of the work (not as an afterthought):
   - **`CHANGELOG.md`** — add an entry under `## [Unreleased]` in the correct
     subsection (`Added` / `Changed` / `Fixed` / `Deprecated` / `Removed`),
     Keep-a-Changelog style, describing the API and the OOXML it emits (match
     the existing entries' level of detail).
   - **`docs/FEATURE-MATRIX.md`** — flip the relevant row's status
     (`❌ Missing`/`⚠️ Partial` → `✅ Done`) and update the "at a glance" lists.
   - **`website/docs/*.md`** — the user-facing API docs (`api-shapes.md`,
     `api-text.md`, `api-charts.md`, etc.). Add/extend the section for the new
     option with a short code example. A feature is not "done" until it is
     documented here.
   A PR/commit that changes behavior without updating all three is incomplete.

---

## Release procedure (cut a version)

A release is **fully automated** via the GitHub Actions workflows — do not
publish from a local machine. The flow:

1. Ensure `master` is green: `npm test` ends `Failed: 0` and CI (`ci.yml`) is
   passing on the latest commit. **Never release a red build.**
2. **Roll over the CHANGELOG and confirm docs.** Before bumping:
   - In `CHANGELOG.md`, convert the `## [Unreleased]` section into a dated,
     versioned release heading — `## [X.Y.Z] - YYYY-MM-DD` — keeping its
     `Added`/`Changed`/`Fixed` entries, and start a fresh empty
     `## [Unreleased]` above it. (Pick `X.Y.Z` to match the bump you will run:
     patch vs minor.)
   - Confirm `docs/FEATURE-MATRIX.md` and the relevant `website/docs/*.md`
     reflect everything in this release (they should already be current per
     ground rule 8 — this is a final check).
   - Commit this as `docs(changelog): release X.Y.Z` and push. The release
     notes for the version come straight from this CHANGELOG section.
3. Trigger the version bump + tag + publish chain:
   ```bash
   gh workflow run version-bump.yml --ref master -f bump=patch -R jsamuel1/PptxGenJS
   ```
   Use `bump=patch` for bug-fix releases, `bump=minor` for new features.
   The chosen bump **must** match the version you wrote into the CHANGELOG.
   This workflow bumps `package.json` + the `VERSION` constant in
   `src/pptxgen.ts`, commits `chore(release): X.Y.Z`, pushes the `vX.Y.Z`
   tag, and then **auto-dispatches `publish.yml`** for that tag (no manual
   step, no PAT needed).
4. Watch both runs to success:
   ```bash
   gh run watch <version-bump-run-id> -R jsamuel1/PptxGenJS --exit-status
   gh run watch <publish-run-id>      -R jsamuel1/PptxGenJS --exit-status
   ```
   `publish.yml` re-runs the full build + test suite, then publishes to npm
   via trusted publishing (OIDC, with provenance).
5. Verify the release is live:
   ```bash
   npm view @jsamuel1/pptxgenjs version   # should equal the new X.Y.Z
   ```
6. `git fetch` and fast-forward local `master` to the release commit the
   workflow pushed.

> **When to release** is called out explicitly in the phase checkpoints below
> (a **patch** after Phase 0, a **minor** after each feature set). Always
> follow this same procedure.

---

## Phase 0 — Make the test suite green (BLOCKING)

`npm test` currently ends `Passed: 34  Failed: 8` on the schema suite, which
means CI is red and `publish.yml` (which runs `npm test`) is blocked. These 8
failures were added by the "Added tests" work and expose **real chart/gradient
emission bugs**. Fix the code; do not weaken the tests.

Run `node test/run-schema.js` to reproduce. The failures group into 5 root
causes:

### 0.1 — `<c:invertIfNegative>` emitted for non-bar chart types
- **Symptom:** `area`, `radar`, `line`, `combo` fixtures fail:
  `invalid child element '...:invertIfNegative'`.
- **Cause:** `invertIfNegative` is only valid on bar/bubble series
  (`CT_BarSer`/`CT_BubbleSer`), but it is emitted for other series types.
  See `src/gen-charts.ts` ~lines 886, 936, 1260.
- **Fix:** only emit `<c:invertIfNegative>` when the chart type is one that
  allows it (bar, bar3D, bubble). Gate each emit on chart type.
- **Done when:** `chart-area`, `chart-radar`, `chart-line` pass; combo no
  longer reports `invertIfNegative`.

### 0.2 — `<c:varyColors>` ordered before `<c:grouping>`
- **Symptom:** `line` and `combo` fixtures fail:
  `unexpected child element '...:varyColors' ... expected: <...:grouping>`.
- **Cause:** In `CT_LineChart` (and the line branch of combo), `varyColors`
  must follow `grouping` per the schema sequence. Current emit order is wrong.
  See `src/gen-charts.ts` ~lines 798–810 (grouping vs varyColors ordering).
- **Fix:** emit `<c:grouping>` **before** `<c:varyColors>` for line/combo
  (match `CT_LineChart` element order: `grouping`, `varyColors`, `ser`...).
- **Done when:** `chart-line` and `chart-combo` no longer report varyColors.

### 0.3 — Bubble chart emits invalid `<c:auto>`
- **Symptom:** `bubble` fixture: `invalid child element '...:auto'`
  (`/ppt/charts/chart9.xml`).
- **Cause:** a `<c:auto>` element is emitted where `CT_BubbleChart` does not
  allow it. See `src/gen-charts.ts` ~line 1727 (`<c:auto val="1"/>`); confirm
  the call path that reaches it for bubble.
- **Fix:** suppress `<c:auto>` for bubble series (or move it to the valid
  axis context only).
- **Done when:** `chart-bubble` passes.

### 0.4 — Scatter chart throws `Cannot read properties of undefined (reading '0')`
- **Symptom:** `scatter (XY) chart` fails with a runtime TypeError (not a
  schema error) — generation crashes.
- **Cause:** an array access on undefined data in the scatter path of
  `makeChartType` / scatter series builder in `src/gen-charts.ts`.
- **Fix:** guard the access; build scatter series defensively (the test's
  data shape is valid, so the code must handle it).
- **Done when:** `chart-scatter` generates and passes schema.

### 0.5 — Out-of-range numeric inputs emitted verbatim (the 2 `BUG-EXPOSURE` xfails)
These two tests are intentionally written to fail *until the value is clamped*.
Implement clamping so the emitted XML is schema-valid, then the tests pass.

- **Doughnut `holeSize`:** `holeSize:500` emits `<c:holeSize val="500"/>` but
  `ST_HoleSize` = `xsd:unsignedByte` restricted **1–90** (PowerPoint allows
  10–90). Clamp to a valid range before emit. See `src/gen-charts.ts` ~1636.
- **Gradient stop `position`/`transparency`:** values map to OOXML units with
  `MaxInclusive 100000` (e.g. `pos` and `alpha` are in thousandths of a
  percent). Out-of-range inputs exceed `100000`. Clamp `position` to 0–100 and
  `transparency`/alpha to 0–100 (→ 0–100000 EMU-percent) before emit. Stop
  emit lives in the gradient-fill path in `src/gen-xml.ts` (gradient `gsLst`
  builder) / `src/gen-utils.ts` color selection.
- **Done when:** `chart-doughnut-holesize-oob` and `gradient-stop-oob` pass
  with the clamped (valid) values, and the test comments are updated from
  "expected to FAIL" to assert the clamped output.

### Phase 0 exit criteria
- `npm test` → both suites `Failed: 0`.
- `npm run build && npm run ship && npm run lint` clean.
- Each root cause is its own commit (`fix(charts): ...`, `fix(gradient): ...`)
  with a regression fixture proving the schema is now valid, **and a
  `CHANGELOG.md` `Fixed` entry** describing each bug.
- Push; confirm CI (`ci.yml`) goes green before starting Phase 1.
- **🚀 RELEASE: cut a patch version now.** Once CI is green on `master`, run
  the [Release procedure](#release-procedure-cut-a-version) with `bump=patch`
  (this is a bug-fix release) — including the CHANGELOG roll-over step. Verify
  the new version is live on npm before moving on.

---

## Phase 1 — Finish the partials

These are listed `⚠️ Partial` in the matrix — already half-built, lowest risk,
highest reuse. The animation timing engine already emits real
`<p:seq nodeType="mainSeq">` build steps, so animation work reuses it.

Each feature has a detailed spec in `docs/feature-*.md` — **read the spec
before implementing** (API, emitted OOXML, touch points, edge cases, tests):

- 1.1 — [`docs/feature-pattern-fill.md`](docs/feature-pattern-fill.md) — `a:pattFill`
- 1.2 — [`docs/feature-picture-fill.md`](docs/feature-picture-fill.md) — `a:blipFill`
- 1.3 — [`docs/feature-emphasis-animations.md`](docs/feature-emphasis-animations.md) — `p:animClr`/`p:animScale`/`p:animRot`
- 1.4 — [`docs/feature-exit-animations.md`](docs/feature-exit-animations.md)
- 1.5 — [`docs/feature-header-footer.md`](docs/feature-header-footer.md) — `p:hf`

### Phase 1 exit criteria
- All sub-features schema-validated with fixtures; full verify gate clean;
  **docs + CHANGELOG + matrix updated** (`⚠️ Partial`/`❌` → `✅`), and each
  spec's `Status` flipped to `Implemented`.
- **🚀 RELEASE: cut a minor version** once `master` is green — run the
  [Release procedure](#release-procedure-cut-a-version) with `bump=minor`
  (new features). You may release after the whole phase, or after a coherent
  subset (e.g. 1.1+1.2 fills, or 1.3+1.4 animations) — but only ever release a
  green build.

---

## Phase 2 — Further shape effects

- 2.1 — [`docs/feature-reflection-effect.md`](docs/feature-reflection-effect.md) — `a:reflection`
- 2.2 — [`docs/feature-soft-edge-effect.md`](docs/feature-soft-edge-effect.md) — `a:softEdge`
- 2.3 — [`docs/feature-shape-3d.md`](docs/feature-shape-3d.md) — `a:sp3d`/`a:scene3d`

All three extend the shared `<a:effectLst>` / `<p:spPr>` emit; mind the
canonical `CT_EffectList` child order when combining with shadow/glow.

### Phase 2 exit criteria
- Fixtures + verify gate clean; docs + CHANGELOG + matrix updated; specs
  flipped to `Implemented`.
- **🚀 RELEASE: cut a minor version** (`bump=minor`) on a green build via the
  [Release procedure](#release-procedure-cut-a-version).

---

## Phase 3 — Timing depth & links

- 3.1 — [`docs/feature-motion-paths.md`](docs/feature-motion-paths.md) — `p:animMotion`
- 3.2 & 3.3 — [`docs/feature-hyperlink-actions.md`](docs/feature-hyperlink-actions.md) — `a:hlinkHover` + action jumps

### Phase 3 exit criteria
- Fixtures + verify gate clean; docs + CHANGELOG + matrix updated; specs
  flipped to `Implemented`.
- **🚀 RELEASE: cut a minor version** (`bump=minor`) on a green build via the
  [Release procedure](#release-procedure-cut-a-version).

---

## Phase 4 — Presentation-level features

In rough priority order; each is self-contained and has its own spec:

- 4.1 — [`docs/feature-comments.md`](docs/feature-comments.md) — `p:cm`/`cmAuthorLst`
- 4.2 — [`docs/feature-embedded-fonts.md`](docs/feature-embedded-fonts.md) — `p:embeddedFontLst` (high value)
- 4.3 — [`docs/feature-custom-shows.md`](docs/feature-custom-shows.md) — `p:custShowLst`
- 4.4 — [`docs/feature-photo-album.md`](docs/feature-photo-album.md) — `p:photoAlbum`
- 4.5 — [`docs/feature-handout-master.md`](docs/feature-handout-master.md) — `p:handoutMasterIdLst`
- 4.6 — [`docs/feature-kinsoku.md`](docs/feature-kinsoku.md) — `p:kinsoku`
- 4.7 — [`docs/feature-smartart.md`](docs/feature-smartart.md) — `dgm:*`/`dsp:*` (large; minimal subset first)
- 4.8 — [`docs/feature-structured-notes.md`](docs/feature-structured-notes.md) — talking-points notes
- 4.9 — [`docs/feature-ink.md`](docs/feature-ink.md) — `p:contentPart` + InkML (niche)

### Phase 4 exit criteria
- Each feature (or coherent subset) schema-validated with fixtures; verify gate
  clean; docs + CHANGELOG + matrix updated; specs flipped to `Implemented`.
- **🚀 RELEASE: cut a minor version** (`bump=minor`) after each shipped feature
  set, on a green build, via the
  [Release procedure](#release-procedure-cut-a-version). Don't batch many
  large features into one release — ship incrementally.

---

## Phase 5 — Standalone feature specs (`docs/feature-*.md`)

**Discover and implement every `docs/feature-*.md` spec that is not yet done.**
This directory is the backlog of feature specs — including developer-experience
helpers not tied to a single OOXML element. The Phase 1–4 specs above are also
`docs/feature-*.md` files; this phase covers **the rest** plus any specs added
later.

### Procedure for each spec

1. **Scan** `docs/feature-*.md` (excluding `FEATURE-MATRIX.md`). For each,
   check its `> **Status:**` line.
2. **Skip** specs marked `Implemented` / `Done`. Implement those marked
   `Proposed` (or with no status).
3. **Confirm it isn't already built** — grep the codebase for the proposed API
   (e.g. the method/option name) before starting; a spec may predate an
   existing implementation.
4. **Implement** per the spec's API / Implementation location / Edge cases,
   following all [ground rules](#ground-rules-apply-to-every-task) (schema
   validation, default-off, clamping, tests).
5. **On completion, mark the spec complete:** change its
   `> **Status:** Proposed` to `> **Status:** Implemented (vX.Y.Z)` and add a
   one-line "Implemented:" note pointing at the source + tests.
6. **Document it** per ground rule 8: CHANGELOG `Added` entry, update
   `docs/FEATURE-MATRIX.md` if it maps to a matrix row, and add user-facing
   docs in `website/docs/*.md`.

### Known standalone specs (DX helpers — implement if still `Proposed`)

Specs carry a `> **Priority:**` line where ordering matters: work `high` before
`medium` before unlabelled. The converter-driven `/utils` specs below are paired with
work items in `../html-to-pptx/PROMPT.md` — releasing them unblocks that repo.

- **High** — [`docs/feature-html-entity-map-completeness.md`](docs/feature-html-entity-map-completeness.md) — extend the `/utils` html-dom named-entity map + export `decodeEntities` (pairs with a conversion-quality *critical*)
- **High** — `parseCards` sibling-card adoption — upstream half of [`../html-to-pptx/docs/feature-grid-card-completeness.md`](../html-to-pptx/docs/feature-grid-card-completeness.md) (dropped "Memory" card)
- **Medium** — [`docs/feature-css-context-layout.md`](docs/feature-css-context-layout.md) — extend cascade-lite `CssContext` from colours to layout properties (`declOf`, grid/flex/column interpreters)
- [`docs/feature-layout-grid.md`](docs/feature-layout-grid.md) — `pptx.layoutGrid()` grid math (pure util)
- [`docs/feature-card-helper.md`](docs/feature-card-helper.md) — `slide.addCard()` structured card
- [`docs/feature-animation-stagger.md`](docs/feature-animation-stagger.md) — `animation.group` auto-grouping sugar
- [`docs/feature-theme-extraction.md`](docs/feature-theme-extraction.md) — HTML/CSS theme extraction utility (review its "should this be in PptxGenJS?" question first)

### Phase 5 exit criteria
- No `docs/feature-*.md` remains `Proposed` (each is either `Implemented` or has
  a documented decision not to build it, e.g. theme-extraction may land as an
  optional util or be declined — record the decision in the spec).
- Each implemented spec: tests + verify gate clean; docs + CHANGELOG updated;
  `Status` flipped to `Implemented`.
- **🚀 RELEASE: cut a minor version** (`bump=minor`) per shipped feature set.

---

## Out of scope (authoring) — do NOT build builders for these

Per the matrix: **OLE objects, VBA/macros, ActiveX controls,
password/encryption.** They require binary part formats or whole-package
encryption that don't fit a portable, zero-dependency JS builder. **However,
they remain in scope for copy fidelity** — a slide-copy/import path must
preserve them verbatim.

---

## Reference

- **Format coverage map:** [`docs/FEATURE-MATRIX.md`](docs/FEATURE-MATRIX.md)
- **Changelog:** `CHANGELOG.md` (Keep a Changelog; add to `## [Unreleased]`).
- **User-facing docs:** `website/docs/*.md` (Docusaurus) — `api-shapes.md`,
  `api-text.md`, `api-charts.md`, `api-tables.md`, `api-images.md`,
  `api-media.md`, etc. Deployed to GitHub Pages by `docs.yml` on changes under
  `website/`.
- **Build:** `npm run build` (fast, `src/bld/*`), `npm run ship` (full `dist/*`).
  Pipeline is rollup + terser (no gulp).
- **Tests:** `test/run.js` (regression, imports `src/bld/pptxgen.cjs.js`),
  `test/run-schema.js` (OpenXML validator). Add fixtures to
  `test/schema.test.js` and `test/feature-*.test.js`.
- **Key source files:** `src/gen-xml.ts` (slide/shape/text XML),
  `src/gen-charts.ts` (chart XML), `src/gen-objects.ts` (object definitions),
  `src/gen-utils.ts` (color/units helpers), `src/core-interfaces.ts` (public
  API types), `src/core-enums.ts` (shape/chart enums).
