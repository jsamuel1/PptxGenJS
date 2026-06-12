# PptxGenJS Testing Guide

This document covers (1) the automated test conventions every contribution must follow,
and (2) how to manually test PptxGenJS across supported platforms prior to release.
General contribution rules live in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Automated test conventions (all contributions)

Commands: `npm test` runs the regression suite (`test/run.js`, discovers
`test/{bug-NN,feature-*}.test.js`) and the OOXML schema suite (`test/run-schema.js`).
Both must end `Failed: 0`. `npm run lint` must add no new errors.

**The success gate is the exit code, not the output.** A test run passes if and only
if the command exits 0 — verify with `npm test; echo "exit=$?"`. Never judge a run by
counting `ok` lines, tailing the log, or reading a sub-runner's summary: a crashed
runner can stream hundreds of `ok` lines and end on a passing-looking `node:test`
summary while having skipped half the suite. (Incident: two `describe/it`-style test
files crashed `test/run.js` mid-suite; both builder and reviewer read the `ok` stream,
concluded "all tests pass", and committed — silently skipping ~180 tests and the
entire schema suite.)

**Test files export an array.** Every `test/{bug-NN,feature-*}.test.js` must
`module.exports` an array of `{ name: string, fn: async function }` cases — this repo's
runner does not understand `node:test` / mocha `describe/it` files. The runner rejects
wrong-shaped files as named failures.

The rules below each exist because their absence shipped a bug — see the incident notes
in [CONTRIBUTING.md](./CONTRIBUTING.md).

1. **Tests import the built public entry only.** `require('../src/bld/utils.cjs.js')` /
   `require('../src/bld/pptxgen.cjs.js')` — never an internal module bundle. A test that
   can only reach your code through a private rollup entry is testing code that no
   consumer can use.
2. **API parity is enforced.** `test/feature-api-parity.test.js` asserts that the
   runtime exports of the `/utils` entry and the declarations in `types/utils.d.ts`
   match exactly, in both directions. If your change makes it fail, fix the surface —
   don't touch the test.
3. **Real-world fixtures for parser code.** Anything that parses framework-emitted CSS
   or HTML needs at least one **byte-exact real emission** as a fixture (e.g. Tailwind
   `grid-cols-3` emits `grid-template-columns: repeat(3, minmax(0, 1fr))` — with the
   space). Hand-minimal fixtures systematically dodge the bugs real input hits.
4. **Negative-space tests for extractors.** Anything that *detects* content (cards,
   timelines, quotes…) must also test what it must **not** match: footnotes, prose,
   blockquotes, sibling containers. Over-matching corrupts output as surely as
   under-matching loses it.
5. **Spec criteria map to named tests.** Each acceptance criterion in a
   `docs/feature-*.md` should be recognisable as a named test case, so a reviewer can
   diff the spec against the suite. Edge cases the spec lists are not optional.
6. **Adversarial self-check before declaring done.** Run your new code against tricky
   inputs that are *not* in your own tests (`node -e` against the built entry). Tests
   written by the code's author validate the author's assumptions by construction.
7. **Real-render claims need real PowerPoint.** Schema validity is necessary, not
   sufficient — files that validate can still hit PowerPoint's repair dialog. The
   PowerPoint render tier (`npm run test:ppt`, see
   `docs/feature-powerpoint-render-verification.md`) drives installed Microsoft
   PowerPoint on macOS via AppleScript: open (repair prompt = failure), slide count,
   PNG export. Loud SKIP on CI (`CI`/`GITHUB_ACTIONS`; GitHub-hosted runners have no
   Office — a self-hosted Mac runner opts in via `RUNNER_HAS_POWERPOINT=1`) and on
   Macs without PowerPoint (`REQUIRE_POWERPOINT=1` escalates to failure). A skipped
   tier must appear in the summary — never read as a bare PASS.

---

The sections below cover the manual, human-eyes platform matrix.

> ✅ Run these tests to ensure compatibility with major bundlers, runtimes, and front-end frameworks.

Config Notes

> ⚠️ Disable VPN on the server machine, otherwise, clients using the local IP address cannot connect.

Testing Steps

1. Run `npm run ship` to refresh release artefacts (`dist/pptxgen.{cjs,es,min}.js`, `demos/browser/js/pptxgen.bundle.js`).
2. Run `npm run release-test` for the automated end-to-end suite — drives the browser demo, Web Worker demo, Node CLI demo, Node stream demo, and Vite build, validating each generated `.pptx` against the OOXML schema.
3. Run the manual sections below for items that require human eyes (Microsoft 365 web viewer, iOS rendering, PowerPoint visual inspection).

## 🧪 Test Suites Overview

| Platform        | Tooling              | Status |
| --------------- | -------------------- | ------ |
| Browser         | Standalone HTML demo | ✅      |
| Node.js         | Native CLI           | ✅      |
| Web Worker      | JS Worker demo       | ✅      |
| Vite/TypeScript | Modern front-end SPA | ✅      |
| Webpack         | SharePoint Framework | ✅      |

---

## 🌐 Browser Tests

**Purpose:** Validate browser compatibility using the standalone bundle as script.

### Automated Coverage

Browser desktop and Web Worker paths are exercised by `npm run release-test` (see `test/release/browser.test.js` and `test/release/worker.test.js`). The harness drives every `#btnRunBasicDemo` / `#btnRunSandboxDemo` / `#btnGenFunc_*` / `#btnRunAllDemos` button on `demos/browser/index.html` plus the `#generatePptWorker` flow on `demos/browser/worker_test.html`, then validates each generated `.pptx` against the OOXML schema.

The manual desktop / iOS sections below remain for human-eye verification (visual rendering, gesture handling, and devices the headless harness does not cover).

### Desktop & Mobile Browsers

Run local test server:

```bash
cd demos
node browser_server.mjs
```

1. Open the [Demo Page](http://localhost:8000/browser/index.html).
2. In DevTools, confirm the latest `pptxgen.bundle.js` is loaded (`Sources` tab).
3. Run all UI-driven demos and verify demo presentation render correctly.
4. Open the [Demo Page](http://192.168.254.x:8000/browser/index.html) on iPhone & test.

### Web Worker API

1. Open the [Web Worker Demo Page](localhost:8000/browser/worker_test.html).
2. Note: Use Chrome (Safari *will not work*)
3. Run the test; verify result & library version

### Microsoft 365 Check

1. Upload the full demo output from above to M365/Office/OneDrive.
2. Use web viewer to validate file

---

## 📦 Node.js Tests

**Purpose:** Validate functionality of CommonJS module in pure Node environments.

Automated by `npm run release-test`. The harness spawns `node demo.js`, `node demo.js All`, and `node demo_stream.js` from `demos/node/` (via `npm install --prefix demos/node` on first run) and validates each generated `.pptx` against the OOXML schema. See `test/release/node.test.js` for the full case list.

---

## ⚛️ Vite + TypeScript Tests

**Purpose:** Validate integration in modern front-end SPA toolchains (Vite, TypeScript, React-compatible).

Automated by `npm run release-test`. The harness runs `tsc -b && vite build` against `demos/vite-demo/` (via `npm install --prefix demos/vite-demo` on first run, with a post-install `gulp reactTestCode reactTestDefs` to override the published artefacts with the freshly-built `dist/pptxgen.es.js` and `types/index.d.ts`) and asserts the entry HTML plus at least one hashed JS chunk under `dist/assets/`. See `test/release/vite.test.js`.

### IDE IntelliSense (Manual)

Type-definition autocomplete still warrants a quick manual check in an IDE that the headless harness cannot replicate:

- Open `demos/vite-demo/src/tstest/Test.tsx`.
- Use IntelliSense to autocomplete things like `pptxgen.ChartType.`.

### Mobile Smoke (Manual)

For iOS / Android visual inspection, run the dev server interactively:

```bash
cd demos/vite-demo
npm run dev
```

Then export and open a `.pptx` on each device to verify MIME handling and visual fidelity.

---

## 🚀 Build for gh-pages (Manual)

After confirming the above:

```bash
npm run build
```

1. Copy the entire `dist` folder from `demos/vite-demo/` to a safe location.
2. Use this copy when updating the `gh-pages` branch after the release.

> ⚠️ DO NOT use the "deploy" script displayed onscreen by Vite. Manual copying ensures full control over final content.

---

## 🎬 Animations & Transitions (Manual)

**Purpose:** Confirm the native slide transitions, shape entrance animations, and number-counter sugar *play back* correctly. The automated regex suite (`node test/run.js`) and the OOXML schema suite (`node test/run-schema.js`) already prove the *emitted XML* is correct and schema-valid — this manual pass only verifies *playback*, which cannot be automated.

> ⚠️ Use **desktop Microsoft PowerPoint**. LibreOffice Impress and Apple Keynote render only the final static state and will **not** play the entrance/transition sequence, so they cannot verify this feature.

1. Build a deck that exercises:
   - Each transition type: `fade`, `push`, `wipe`, `cover`, `split`, `cut` (with a few `direction` variants on the directional ones).
   - Each animation type: `appear`, `fadeIn`, `flyIn` (all four directions `left`/`right`/`up`/`down`), `zoomIn`.
   - A `counter` count-up (e.g. `addText('', { counter: { from: 1, to: 10, suffix: '%', stepMs: 200 } })`).
2. Open the deck in desktop PowerPoint and run the slideshow (`F5`).
3. Verify on slide-advance each transition plays as configured.
4. Verify each animated shape enters with the expected motion (fade in, fly in from the correct edge, zoom up from nothing) and that staggered `delay`/`trigger` ordering matches expectations.
5. Verify the counter counts up frame-by-frame to its final value.

---

## 🏁 Test Completion Checklist

| Dist File         | Test       | Tested Via             | Automation                                        | Result |
| ----------------- | ---------- | ---------------------- | ------------------------------------------------- | ------ |
| pptxgen.es.js     | Webpack 4  | SPFx (v1.16.1) project | 👤 manual (SPFx runtime)                           | ✅?🟡    |
| pptxgen.es.js     | Webpack 5  | SPFx (v1.19.1) project | 👤 manual (SPFx runtime)                           | ✅?🟡    |
| pptxgen.es.js     | Rollup 4   | Vite (v6) demo         | 🤖 `npm run release-test` (`vite.test.js`)         | ✅?🟡    |
| pptxgen.es.js     | Webworkers | worker_test demo       | 🤖 `npm run release-test` (`worker.test.js`)       | ✅?🟡    |
| pptxgen.cjs.js    | Node/CJS   | Node demo              | 🤖 `npm run release-test` (`node.test.js`)         | ✅?🟡    |
| pptxgen.bundle.js | Script     | Browser demo (desktop) | 🤖 `npm run release-test` (`browser.test.js`)      | ✅?🟡    |
| pptxgen.bundle.js | Script     | Browser demo (iOS)     | 👤 manual (no headless iOS runner)                 | ✅?🟡    |
