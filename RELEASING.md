# PptxGenJS Release Checklist

> This guide documents how to perform a release of this fork (`@jsamuel1/pptxgenjs`).
> Releases are automated via GitHub Actions — the manual steps below are a fallback.

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

1. Land all changes on `main` with their notes recorded under `## [Unreleased]`
   in `CHANGELOG.md` (Added / Changed / Fixed / etc.).
2. Open the **Actions** tab → **Version Bump and Tag** → **Run workflow**.
3. Choose the `bump` type (`patch`, `minor`, `major`, or `prerelease`). For a
   prerelease, set the `preid` (default `beta`).
4. The workflow does the rest: version bump, `VERSION` sync, CHANGELOG roll-up,
   commit/tag/push, and it dispatches `Publish to npm`.
5. Watch **Publish to npm** complete: it builds, runs the test suite, publishes to
   npm, and opens the GitHub Release.

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
