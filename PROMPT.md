# PptxGenJS Fork — Work Plan

> **Audience:** A developer (or agent) implementing fixes and features in this
> fork (`github.com/jsamuel1/PptxGenJS`). This document holds the contribution
> ground rules and the release procedure; the live work queue is **Linear**
> (issues labelled `repo:library`), specs are in [`docs/features/`](docs/features/),
> and format-coverage status is [`docs/FEATURE-MATRIX.md`](docs/FEATURE-MATRIX.md).

---

## Ground rules (apply to every task)

> **Intent anchor:** the project's standing Goals live in [README-Fork.md](./README-Fork.md#goals);
> AGENTS.md binds every role to them and the critic reviews for *intent deviations*
> (re-skins, fabricated data, silent narrowing), not just correctness. The critic's intent checklist
> is armed by default (`profiles.default = "user:intent"` in the global autoloop
> config; fragments at `~/.config/autoloops/profiles/intent/`). `--profile
> repo:intent` additionally layers this repo's incident-specific fragment.
>
> **Read first, every run:** [CONTRIBUTING.md](./CONTRIBUTING.md) (spec lifecycle,
> definition of done for public APIs, git staging discipline),
> [TESTING.md → Automated test conventions](./TESTING.md#automated-test-conventions-all-contributions),
> and [RELEASING.md → Release gates](./RELEASING.md#release-gates-before-any-version-bump).
> Those documents are the canonical contribution rules and prevail over this list on
> conflict; the numbered rules below are the task-execution subset. In particular:
> stage commits explicitly by path (never `git add -A`/`commit -a`), never cut a
> release in the same iteration that implemented the feature, and a spec is only
> "Implemented" once its stated consumer can actually use it.
>
> **Check the shared task queue, every run AND every iteration:** run
> `autoloop task list` at the start of the run and re-check it at each iteration
> boundary. Open tasks are steering from reviewers and other sessions — they are part
> of your work queue, often carrying corrections to work you believe is done; review
> tasks (named "REVIEW FIXES"/"FOLLOW-UP") take priority over new feature slices.
> Mark each one done with `autoloop task complete <id>` in the same iteration you
> close it — the task list is shared state across sessions, and leaving it stale
> sends the next agent chasing finished work.

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

A release is **fully automated** via the GitHub Actions workflows — do not publish
from a local machine. Follow the
[CLI procedure in RELEASING.md](./RELEASING.md#cli-procedure-agents-use-this--run-every-step-in-order)
**exactly and to completion** — every step, in order:

1. All [release gates](./RELEASING.md#release-gates-before-any-version-bump) pass
   (suite green incl. API parity; not the same iteration that implemented the feature).
2. **`git push origin master`** — anything unpushed is not in the release.
3. Dispatch **Version Bump and Tag**
   (`gh workflow run version-bump.yml -f bump=patch|minor`) — it bumps, rolls the
   CHANGELOG automatically (`update-changelog.mjs`; do **not** roll it by hand), tags
   `vX.Y.Z`, and auto-dispatches **Publish to npm**.
4. **Watch BOTH runs to success** (`gh run watch <id> --exit-status` for the
   version-bump run, then the publish run). The release is not done when the bump
   finishes — npm publish + GitHub Release happen in the second run.
5. **Pull the tagged version back before finalising anything**:
   `git pull --tags origin master`, then verify
   `git describe --tags --exact-match HEAD`, local `package.json` version, and
   `npm view @jsamuel1/pptxgenjs version` all agree. Only then update spec statuses,
   bump downstream consumers, or report the release done. If any step fails, stop and
   report the intermediate state — never re-dispatch blindly (it double-bumps).

> **When to release:** a **patch** for bug-fix-only batches, a **minor** after a
> shipped feature or coherent feature set. Release only a green build, and never in
> the same iteration that implemented the feature. Always follow this same procedure.

---

## Queue — Linear is the source of truth

The old Phase 0-5 roadmap is retired. Work is tracked in **Linear** (project
"HTML → PPTX (library + skill)", issues labelled `repo:library`) and specified in
[`docs/features/`](docs/features/); [`docs/FEATURE-MATRIX.md`](docs/FEATURE-MATRIX.md)
records what is shipped vs open across the OOXML surface.

Per iteration:

1. Pick the top **unblocked** `repo:library` issue (respect `blocked-by`; review /
   follow-up issues take priority over new feature slices).
2. Read its linked `docs/features/feature-*.md` spec **and the issue comments** — code
   review and cross-deck findings put file:line evidence, root cause, and acceptance
   criteria there.
3. Implement per the [ground rules](#ground-rules-apply-to-every-task) (schema-validate,
   default-off, clamp, public-API definition of done); update `CHANGELOG.md` +
   `docs/FEATURE-MATRIX.md` + `website/docs/*.md` in the same commit; flip the spec
   `Status` to `Implemented` only when its consumer can use it; move the Linear issue
   In Review -> Done.
4. Release per the procedure above when a feature (or coherent set) is green on `master`.

Phase 0 (chart/gradient schema fixes) shipped — its regression analysis lives in git
history and `CHANGELOG.md`; the standing rules it produced are ground rules 2 & 4 and
[ADR-0005](docs/architecture/decisions/0005-schema-validate-clamp.md).

---

## Out of scope (authoring) — do NOT build builders for these

Per the matrix: **OLE objects, VBA/macros, ActiveX controls,
password/encryption.** They require binary part formats or whole-package
encryption that don't fit a portable, zero-dependency JS builder. **However,
they remain in scope for copy fidelity** — a slide-copy/import path must
preserve them verbatim.

---

## Reference

- **Architecture:** [`docs/architecture/overview.md`](docs/architecture/overview.md)
  (entries, module map, build/release, verification); decisions in
  [`docs/architecture/decisions/`](docs/architecture/decisions/README.md) — read the
  ADRs before proposing a direction change, and record one when you make one.
- **Feature specs:** [`docs/features/`](docs/features/) (one contract per feature;
  the `> **Status:**` line in each spec is authoritative).
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
