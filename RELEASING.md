# PptxGenJS Release Checklist

> This guide documents how to perform a release of this fork (`@jsamuel1/pptxgenjs`).
> Releases are automated via GitHub Actions — the manual steps below are a fallback.
> General contribution rules: [CONTRIBUTING.md](./CONTRIBUTING.md).

## Release gates (before any version bump)

These apply to **every** release, automated or manual, human- or agent-initiated:

1. **Never release in the same session/iteration that implemented the feature.** A
   release requires a verification pass with fresh eyes (a review, or at minimum a
   separate iteration that re-checks the gates below). *(Incident: 4.3.13 was cut in
   the same loop run that implemented the css-context helpers — which were not actually
   reachable from the package's public surface.)*
2. **Full suite green**: `npm test` ends `Failed: 0` on both suites — this includes
   `test/feature-api-parity.test.js` (typed surface ↔ runtime surface).
3. **Consumer proof for new public API**: after `npm run ship`,
   `node -e "console.log(typeof require('./dist/utils.cjs.js').newFn)"` prints
   `function` for each API the release advertises.
4. **CHANGELOG entries exist** under `## [Unreleased]` for everything the release
   contains; specs being released as "Implemented" have actually met the definition of
   done in [CONTRIBUTING.md](./CONTRIBUTING.md#definition-of-done--public-api).
5. **No git-config mutation**: release tooling must pass any bot identity with
   `git -c user.name=… -c user.email=…` per invocation, never `git config`. A locally
   run fallback release commits as **you**, not as a bot.

## 🤖 Automated Release (preferred)

Releases run through two GitHub Actions workflows:

- **`.github/workflows/version-bump.yml`** (`Version Bump and Tag`) — run manually
  from the Actions tab. It bumps the version, syncs the `VERSION` constant, rolls
  the `CHANGELOG.md` `[Unreleased]` section into a dated release section, commits,
  tags `vX.Y.Z`, pushes, and dispatches the publish workflow.
- **`.github/workflows/publish.yml`** (`Publish to npm`) — triggered by the version
  bump (or by pushing a `v*` tag). It builds, tests, publishes to npm via trusted
  publishing (OIDC), and creates the GitHub Release with the build artifacts.

### Steps

1. Land all changes on `master` with their notes recorded under `## [Unreleased]`
   in `CHANGELOG.md` (Added / Changed / Fixed / etc.).
2. Open the **Actions** tab → **Version Bump and Tag** → **Run workflow**.
3. Choose the `bump` type (`patch`, `minor`, `major`, or `prerelease`). For a
   prerelease, set the `preid` (default `beta`).
4. The workflow does the rest: version bump, `VERSION` sync, CHANGELOG roll-up,
   commit/tag/push, and it dispatches `Publish to npm`.
5. Watch **Publish to npm** complete: it builds, runs the test suite, publishes to
   npm, and opens the GitHub Release.

### CLI procedure (agents use this — run every step, in order)

A release is **not finished** until the final pull-back-and-verify step passes. Do not
mark any spec Implemented-and-released, bump downstream dependencies, or end the
iteration between dispatching the workflow and completing step 5.

```bash
# 0. Gates (see "Release gates" above) all pass; working tree clean.

# 1. Push local commits — the workflow runs against origin/master, so anything
#    unpushed is NOT in the release.
git push origin master

# 2. Dispatch the version-bump workflow (choose bump: patch | minor | major).
gh workflow run version-bump.yml -f bump=patch

# 3. Watch it to completion (it commits the bump, tags vX.Y.Z, and dispatches publish).
sleep 10   # give the run a moment to register
gh run list --workflow=version-bump.yml --limit 1   # note the run id
gh run watch <run-id> --exit-status                 # non-zero exit ⇒ STOP, diagnose

# 4. Watch the chained "Publish to npm" run to completion as well — the release is
#    not done when the bump finishes; npm publish + GitHub Release happen here.
gh run list --workflow=publish.yml --limit 1
gh run watch <publish-run-id> --exit-status         # non-zero exit ⇒ STOP, diagnose

# 5. Pull the release back and verify BEFORE finalising anything locally.
git pull --tags origin master
# Verify: local HEAD is the release commit, and the tag + npm agree on the version:
git describe --tags --exact-match HEAD              # must print vX.Y.Z
node -p "require('./package.json').version"         # must print X.Y.Z
npm view @jsamuel1/pptxgenjs version                # must print X.Y.Z (npm propagation
                                                    # can lag ~a minute; retry, don't skip)
```

Only after step 5 passes: update spec statuses/CHANGELOG-dependent notes, notify or
bump downstream consumers (`../html-to-pptx` pins `@jsamuel1/pptxgenjs`), and report the
release done. If any step fails, the release is in an intermediate state — say so
explicitly rather than retrying the dispatch blindly (a second dispatch creates a
second version bump).

> **CHANGELOG:** You do **not** edit version/date headings by hand. Just keep entries
> under `## [Unreleased]`; `tools/build/update-changelog.mjs` (invoked by the version
> bump) moves them into `## [X.Y.Z](…/releases/tag/vX.Y.Z) - YYYY-MM-DD` and leaves a
> fresh empty `[Unreleased]`. It is idempotent and a no-op when `[Unreleased]` is empty.

### Prereleases / betas

Run **Version Bump and Tag** with `bump = prerelease` (and a `preid`, e.g. `beta`).
The publish workflow detects `-beta`/`-alpha`/`-rc` tags and publishes them under the
npm `beta` dist-tag and flags the GitHub Release as a pre-release.

## 🛠️ Manual Release (fallback)

Use only if the workflows are unavailable. Run from the package root.

1. Update `package.json` version
2. Update `src/pptxgen.ts` version (eg: `const VERSION = '4.2.0'`)
3. Roll the changelog: `node tools/build/update-changelog.mjs <version>`
   (moves `[Unreleased]` into the dated version section)
4. Build library: npm scripts > `ship`
5. Confirm `types/index.d.ts` version in the head comment is updated
6. Open `dist/*.js` and check headers
7. Update version in: `demos/node/package.json`
8. Update pptxgenjs dep version in: `demos/vite-demo/package.json`
9. Commit, tag (`git tag vX.Y.Z`), and push the tag — pushing a `v*` tag triggers
   `publish.yml`. To publish locally instead: `npm publish` (append `--tag beta`
   for prereleases).

## 🧪 Run Tests Before Release

> The `Publish to npm` workflow runs the full suite automatically. Run locally first
> if releasing manually.

### ⚠️ Run Standard Test Suite

See [TESTING.md](./TESTING.md) for complete test instructions.

### ⚠️ Capture Testing Results

| Dist File         | Test       | Tested Via             | Result |
| ----------------- | ---------- | ---------------------- | ------ |
| pptxgen.es.js     | Webpack 4  | SPFx (v1.16.1) project | ✅?🟡    |
| pptxgen.es.js     | Webpack 5  | SPFx (v1.19.1) project | ✅?🟡    |
| pptxgen.es.js     | Rollup 4   | Vite (v6) demo         | ✅?🟡    |
| pptxgen.cjs.js    | Node/CJS   | Node demo              | ✅?🟡    |
| pptxgen.bundle.js | Script     | Browser demo (desktop) | ✅?🟡    |
| pptxgen.bundle.js | Script     | Browser demo (iOS)     | ✅?🟡    |
| pptxgen.bundle.js | Web Worker | worker_test demo       | ✅?🟡    |

## 🏁 Post-Release Tasks

1. Test CDN links on README.md
2. Verify the GitHub Release and attached artifacts look correct
3. Update `installation.md` with latest CDN version (gh-pages docs)
4. Update API documentation if needed
