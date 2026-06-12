# Feature: Sandbox Test Coverage for `embedFont` (library + wrapper)

> **Status:** Implemented
> **Created:** 2026-06-11
> **Target:** Library (`test/feature-sandbox-runtime.test.js`) + wrapper (`html-to-pptx` skill)
> **Depends on:** `feature-embedfont-sandbox-compat.md` (the fix itself)
> **Related:** `feature-sandbox-runtime-compat.md` (existing sandbox test infra)

## Problem

The existing sandbox runtime test (`test/feature-sandbox-runtime.test.js`) covers:

- Gap 1: `write({ outputType: 'nodebuffer' })` without `process` or dynamic `import()`
- Gap 2: Compressed zip generation without `setImmediate`
- Gap 3: No `eval`/`new Function`/`wasm` code generation

**Missing:** `embedFont()` with filesystem paths is not exercised in the sandbox context.
The current test generates a minimal deck (`addText`) but never calls `pptx.embedFont()`.
This allowed the 0-byte `.fntdata` regression to ship undetected.

Additionally, the `html-to-pptx` wrapper script has no automated tests. When the library
silently produces corrupted output (0-byte fonts), the wrapper has no assertion to catch it
before delivering the file to the user.

## Scope

Two test locations, two audiences:

| Location | Purpose | Catches |
|----------|---------|---------|
| **Library** (`test/feature-sandbox-runtime.test.js`) | Prove `embedFont` works in the faithful vm context | Library regressions (dynamic import re-introduced, Buffer shim gaps) |
| **Wrapper** (`html-to-pptx` skill, new test file) | Prove the end-to-end conversion produces valid PPTX when fonts are declared | Wrapper regressions (config passing, font path resolution, post-process gaps) |

## 1. Library Test Addition

Add to `test/feature-sandbox-runtime.test.js`:

### Test: `embedFont with filesystem path in sandbox context`

```js
it('embedFont with fs path produces non-zero .fntdata in sandbox context', async function () {
    // Uses the faithful-context recipe from the existing test
    // 1. Create a vm context with NO process, NO dynamic import, but WITH require('fs')
    // 2. Build a deck with embedFont({ family: 'TestFont', regular: '<path-to-test.ttf>' })
    // 3. Export via write({ outputType: 'nodebuffer' })
    // 4. Unzip the result
    // 5. Assert ppt/fonts/font1.fntdata exists AND has size > 0
    // 6. Assert presentation.xml contains <p:embeddedFontLst> with typeface="TestFont"
})
```

### Test: `embedFont with unreachable path does not write 0-byte .fntdata`

```js
it('embedFont with invalid path omits the font entry entirely (no 0-byte .fntdata)', async function () {
    // 1. embedFont({ family: 'Ghost', regular: '/nonexistent/path.ttf' })
    // 2. Export via write({ outputType: 'nodebuffer' })
    // 3. Unzip the result
    // 4. Assert ppt/fonts/ does NOT contain a 0-byte .fntdata
    // 5. Assert <p:embeddedFontLst> is ABSENT (all faces failed → list omitted)
    //    OR: the specific font entry is not emitted
})
```

### Test: `embedFont with base64/data-URI works in sandbox context`

```js
it('embedFont with base64 data works in sandbox context (no fs needed)', async function () {
    // 1. Read a test .ttf into base64 outside the vm
    // 2. In the vm context, embedFont({ family: 'B64Font', regular: base64String })
    // 3. Export → unzip → assert font1.fntdata.length === original ttf bytes
})
```

### Test fixture

Add a small `.ttf` test font to `test/fixtures/` (e.g. a subset of a libre-licensed font,
~10KB). The test reads it as both a path and as base64 to cover both branches.

## 2. Wrapper Test (html-to-pptx skill)

Create `tests/` directory in the skill's source (or co-locate with a CI harness):

### Test: `conversion with embedded fonts produces valid PPTX`

```js
// tests/font-embedding.test.js
//
// End-to-end: convert a small HTML file that declares @font-face,
// verify the output PPTX:
//   1. Is a valid ZIP
//   2. Every .fntdata file is > 0 bytes (OR no .fntdata files exist at all)
//   3. If .fntdata files exist, presentation.xml contains <p:embeddedFontLst>
//   4. The file opens without error in a PPTX validator (or at minimum,
//      all slide XML is well-formed)
```

### Test: `conversion without fonts produces no .fntdata entries`

```js
// A plain HTML with no @font-face / no font downloads.
// Assert: no ppt/fonts/ directory, no fntdata content type, no embeddedFontLst.
```

### Invariant (both library and wrapper)

**The invariant being guarded:**

> A PPTX MUST NOT contain a `.fntdata` ZIP entry with 0 bytes. Either the font binary is
> fully present, or the entire font embedding declaration (XML + rels + file) MUST be
> omitted.

This is the assertion that catches the specific corruption observed on 2026-06-11.

## Acceptance Criteria

### Library

- [ ] `test/feature-sandbox-runtime.test.js` includes at least one `embedFont` + fs-path
      test case that runs in the faithful vm context (no `process`, no dynamic import,
      `require('fs')` allowlisted, `codeGeneration: { strings: false, wasm: false }`)
- [ ] A negative test asserts that an unreadable font path does NOT produce a 0-byte
      `.fntdata` in the output ZIP
- [ ] A test font fixture (`test/fixtures/*.ttf`) exists for repeatable testing
- [ ] CI green with the new cases

### Wrapper (`html-to-pptx`)

- [ ] A test file exists that runs the converter on a font-bearing HTML and asserts the
      invariant (no 0-byte `.fntdata`)
- [ ] The test can run outside the QuickWork sandbox (plain Node, to validate the script
      independently of the host environment)
- [ ] The test is documented in the skill's README or SKILL.md

## Notes

The library fix (`feature-embedfont-sandbox-compat.md`) and these tests should land together.
The tests are written to **fail** against the current code (red-green-refactor). Once the
fix lands, they go green and lock the regression.
