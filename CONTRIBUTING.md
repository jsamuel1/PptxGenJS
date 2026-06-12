# Contributing

Conventions for **all** contributions to this fork — human sessions and autonomous
agents/loops alike. [PROMPT.md](./PROMPT.md) (the agent work queue) defers to this file;
on conflict, this file wins. Test conventions live in
[TESTING.md](./TESTING.md#automated-test-conventions-all-contributions), release gates in
[RELEASING.md](./RELEASING.md#release-gates-before-any-version-bump).

Several rules below cite an incident. They are not hypothetical — each one shipped.

## Source of truth

- Local `src/*.ts` is the source of truth. Read it before changing it; do not copy
  implementations from upstream or the web.
- `docs/features/feature-*.md` specs are contracts: API, root cause, touch points, acceptance
  criteria. Read the spec before the source.

## Spec lifecycle

Feature docs carry a `> **Status:**` line with this flow:

- **Proposed** — written, not started. Anyone may create these.
- **Implemented** — flipped **only by the implementer**, in the same commit as the final
  slice, and **only after** proving the spec's stated purpose (see "Definition of done"
  below). Green unit tests alone do not qualify.
  *(Incident: the css-context layout spec was marked Implemented and released in 4.3.13
  while its API was unreachable from the package's public surface.)*
- **Reopened — review fixes required** — a reviewer reverts the status and appends a
  dated `## Review findings` section listing severities, evidence, and required test
  cases. The findings section is the fix contract; close every item before re-flipping.

## Definition of done — public API

A new public function/constant on the `/utils` entry (or the main entry) is done only
when **all** of the following hold:

1. Exported from the entry module (`src/utils.ts` / `src/pptxgen.ts`).
2. Declared in the hand-maintained `types/*.d.ts` that `package.json#exports` points at.
3. Covered by tests that import the **built public entry** (`src/bld/utils.cjs.js`) —
   never a private/test-only bundle. If you need a special rollup entry to test your
   code, that is the signal the code isn't public yet.
4. Proven consumable end-to-end: after `npm run ship`,
   `node -e "console.log(typeof require('./dist/utils.cjs.js').yourFn)"` prints
   `function`.

`test/feature-api-parity.test.js` enforces 1 ↔ 2 automatically in both directions.
*(Incidents: `decodeEntities` shipped without typings; the css-context layout helpers
shipped with neither export nor typings; `tokenizeCode`/`codeRuns` shipped without
typings.)*

## Git discipline

Multiple sessions (humans, loops) may have uncommitted work in this tree at the same
time.

- **Stage explicitly by path.** Never `git add -A`, `git add .`, or `git commit -a`.
- Before committing, `git diff --cached --stat` must list **only** files your change
  touched. *(Incident: a loop commit absorbed an unrelated session's uncommitted
  bug-fix hunks.)*
- One logical change per commit, Conventional Commits style. No `dist/` churn outside
  release commits.
- **Never mutate repo git config** (`user.name`/`user.email`). Scripts that need a bot
  identity pass it per-invocation: `git -c user.name=… -c user.email=… commit …`.
  *(Incident: a release script left the repo committing as `github-actions[bot]` with
  `user.email` unset.)*

## Keep facts fresh

Any factual claim you discover to be stale — in `PROMPT.md`, a spec, or a progress note
(test counts, "currently failing" lists, statuses) — gets corrected in the same commit
as your change. *(Incident: a "Failed: 8" claim outlived its fix and sent a loop
investigating tests that had been green for days.)*

## Documentation

Every behaviour change updates, in the same commit (not as an afterthought):

- `CHANGELOG.md` under `## [Unreleased]` (Keep-a-Changelog subsections).
- `docs/FEATURE-MATRIX.md` row status, where applicable.
- `website/docs/*.md` user-facing API docs, where a relevant page exists.

## Verify before commit

`npm run build` → `npm test` (both suites `Failed: 0`) → `npm run lint` (0 new errors)
→ `npm run ship` when the public surface changed. See
[TESTING.md](./TESTING.md#automated-test-conventions-all-contributions) for what your
tests must look like, and [RELEASING.md](./RELEASING.md#release-gates-before-any-version-bump)
before any version bump.
