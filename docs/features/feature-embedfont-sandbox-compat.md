# Feature: `embedFont` Sandbox Compatibility (no dynamic `import()`)

> **Status:** Implemented
> **Created:** 2026-06-11
> **Target:** `@jsamuel1/pptxgenjs` core — `src/pptxgen.ts` `encodeEmbeddedFonts()`
> **Found by:** `html-to-pptx` converter running inside the QuickWork `run_javascript`
>   sandbox. Font embedding declares `.fntdata` entries but writes **0 bytes** because
>   the file-read path uses `await import('node:fs')` which throws
>   `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` in a `vm` context.
> **Related:** `feature-embedded-fonts.md`, `feature-sandbox-runtime-compat.md`

## Problem

`encodeEmbeddedFonts()` (line ~619 of `src/pptxgen.ts`) resolves font file paths via:

```ts
const { default: fs } = await import('node:fs')
fontData[face.index] = Buffer.from(fs.readFileSync(face.value)).toString('base64')
```

In a Node `vm` sandbox, dynamic `import()` is not available (`ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`).
The `catch` block swallows the error and sets `fontData[face.index] = ''`. Downstream,
`exportPresentation()` (line ~699) writes the empty string into the ZIP:

```ts
zip.file(`ppt/fonts/font${face.index + 1}.fntdata`, fontData[face.index] || '', { base64: true })
```

This produces a valid ZIP entry with 0-byte payload. The `<p:embeddedFontLst>` XML, the
`presentation.xml.rels` font relationships, and the `[Content_Types].xml` `fntdata` Default
are all emitted correctly — but the font binary data is missing. PowerPoint opens the deck,
encounters the 0-byte `.fntdata`, and marks the file as **corrupted**.

### Severity

**High** — the output is a corrupted `.pptx` that cannot be opened in PowerPoint. Unlike
Gap 1/2/3 in `feature-sandbox-runtime-compat.md` (which are about write-path selection and
scheduling), this silently produces invalid output. The library doesn't crash; it generates
a broken file.

## Root Cause

The existing sandbox-compat fix (Gap 1) addressed the `writeFile()` code path in
`exportPresentation` — that path uses `process` detection + dynamic `import('node:fs')`.
The documented workaround is `write({ outputType: 'nodebuffer' })`, which bypasses that path.

However, `encodeEmbeddedFonts` is a **separate** code path that runs **before** the export
method is chosen. It uses the same `process`-detection + dynamic-`import` pattern:

```ts
const isNode = typeof process !== 'undefined' && !!process.versions?.node && process.release?.name === 'node'
// ...
if (isNode && !face.value.startsWith('data:') && /\.(ttf|otf)$/i.test(face.value)) {
    const { default: fs } = await import('node:fs')  // ← FAILS in vm sandbox
```

In the QuickWork sandbox, `process` is undefined → `isNode = false` → the `else` branch
runs `toBase64(face.value)` which treats the filesystem path string as if it were already
base64. A path like `/workspace/tmp/fonts/Inter-Regular.ttf` is not valid base64, so it
writes garbage (or, depending on the ZIP encoder's base64 tolerance, 0 bytes).

**Two distinct failure modes depending on the sandbox:**

| Sandbox variant | `process` available? | `import()` available? | What happens |
|----------------|---------------------|----------------------|--------------|
| QuickWork `run_javascript` (strict) | No | No | `isNode = false` → path string treated as base64 → 0/garbage `.fntdata` |
| Polyfilled `process` (less strict) | Yes | No | `isNode = true` → `await import('node:fs')` throws → catch writes `''` → 0-byte `.fntdata` |

Both result in corrupted output.

## Proposed Fix

Replace dynamic `import('node:fs')` with `require('fs')` in `encodeEmbeddedFonts`:

```ts
return faces.map(async face => {
    try {
        if (!face.value.startsWith('data:') && /\.(ttf|otf)$/i.test(face.value)) {
            // Filesystem path — read via require('fs') (works in vm sandbox with
            // allowlisted require, unlike dynamic import('node:fs'))
            const fs = require('fs')
            fontData[face.index] = Buffer.from(fs.readFileSync(face.value)).toString('base64')
        } else {
            fontData[face.index] = toBase64(face.value)
        }
        return 'done'
    } catch (ex) {
        console.warn(`embedFont: unable to read font face: "${face.value}"\n${String(ex)}`)
        fontData[face.index] = ''
        return 'error'
    }
})
```

Key changes:
1. **Drop the `isNode` guard** for filesystem reads — `require('fs')` is available in the
   QuickWork sandbox (it's in the allowlist), so the environment check is unnecessary.
   If `require` is unavailable (pure browser), the call will throw and hit the catch.
2. **Use `require('fs')` instead of `await import('node:fs')`** — `require` works in
   `vm.createContext` when provided in the context's allowlist; dynamic `import()` requires
   a `importModuleDynamically` callback that sandboxes don't provide.
3. **Keep the catch** — if `require` is unavailable (browser bundle) or the path doesn't
   exist, it falls through gracefully.

### Alternative: Pre-resolved `fs` parameter

A more defensive approach passes `fs` as an optional parameter from `exportPresentation`:

```ts
private readonly encodeEmbeddedFonts = (
    faces: Array<{ index: number, value: string }>,
    fontData: string[],
    fsModule?: typeof import('node:fs')
): Array<Promise<string>> => { ... }
```

The caller resolves `fs` once via `require` at the top of `exportPresentation` (where
the sandbox-compat fix already does this) and passes it down. This avoids redundant
`require` calls and makes the dependency explicit.

## Validation: What about `gen-media.ts`?

The `loadNodeDeps` function in `gen-media.ts` (line 21–27) has the same pattern:

```ts
const loadNodeDeps = isNode
    ? async () => {
        ; ({ default: fs } = await import('node:fs')); ({ default: https } = await import('node:https'))
    }
    : async () => { }
```

This is the **image** encoding path. When `isNode = false` (sandbox), it takes the browser
path — which works correctly for base64 image data but fails for filesystem image paths.
The `feature-sandbox-runtime-compat.md` Gap 1 fix documented that `write({ outputType: 'nodebuffer' })`
is the sandbox-safe export, but `encodeSlideMediaRels` still uses `await import(...)` for
reading images from paths.

**This is a separate issue** (images work when passed as base64/data-URI, which the
converter already does). But the pattern should be audited: every `await import('node:...')`
in the library is a sandbox incompatibility. Consider a single `resolveNodeBuiltin(name)`
helper that uses `require` with a `try/catch` fallback.

## Acceptance Criteria

- [ ] `encodeEmbeddedFonts` reads font files via `require('fs')` (not dynamic `import()`)
- [ ] Calling `pptx.embedFont({ family: 'Inter', regular: '/path/to/Inter.ttf' })` +
      `pptx.write({ outputType: 'nodebuffer' })` inside a `vm` sandbox with
      `require('fs')` allowlisted produces a PPTX with **non-zero** `.fntdata` entries
- [ ] When `require('fs')` is NOT available (browser environment), filesystem-path faces
      log a warning and are skipped — no crash, no 0-byte `.fntdata` written (the
      `<p:embeddedFont>` entry should be omitted entirely for that face)
- [ ] No `await import(...)` remains in `encodeEmbeddedFonts`
- [ ] Regression test added (see `feature-embedfont-sandbox-test.md`)

## Implementation Location

| File | Change |
|------|--------|
| `src/pptxgen.ts` | `encodeEmbeddedFonts()` — replace dynamic import with `require` |
| `src/pptxgen.ts` | `exportPresentation()` — skip writing `.fntdata` ZIP entries when `fontData[i]` is empty (instead of writing a 0-byte entry) |
| `src/gen-xml.ts` | (no change — XML emission is already correct) |
