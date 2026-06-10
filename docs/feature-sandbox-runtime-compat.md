# Feature: Sandbox Runtime Compatibility (locked-down `vm` context)

> **Status:** Implemented
> **Created:** 2026-06-10
> **Target:** `@jsamuel1/pptxgenjs` core + bundle (and `/utils`)
> **Found by:** the `html-to-pptx` converter running inside the QuickWork
>   `run_javascript` sandbox. Several library/bundled-dependency behaviours assume a full
>   Node environment and break (or silently degrade) in a hardened `vm` context.
> **Verified against:** `@jsamuel1/pptxgenjs@4.3.4`.

## What the sandbox actually is

The reference deployment runs library-consuming code inside a Node `vm` context built like
the QuickWork worker (`qw_core/sandbox/executables/nodejs/js_worker.js`). The exact shape
matters because it is far more restrictive than a normal Node global, and it is the
environment the library must tolerate:

```js
const context = vm.createContext(Object.create(null), {
  codeGeneration: { strings: false, wasm: false },   // eval / new Function THROW
})
// ONLY these globals are exposed:
//   require (allowlisted), console, setTimeout, setInterval, clearTimeout, clearInterval,
//   a RESTRICTED Buffer shim (from/alloc/allocUnsafe/isBuffer/concat/byteLength/isEncoding),
//   URL, URLSearchParams, TextEncoder, TextDecoder, session, optional Image/document (canvas)
// NOT provided: setImmediate, clearImmediate, queueMicrotask, process, global, module, exports
// Built-in prototypes + namespace objects are Object.freeze()d.
// Function.prototype.constructor is replaced with a thrower (escape mitigation).
// User code is evaluated wrapped in: (async () => { "use strict"; <code> })()
```

Key consequences for a deck-generation library:

1. **No string code generation.** `eval`, `new Function(...)`, and `wasm` instantiation
   throw `EvalError: Code generation from strings disallowed for this context`. Any
   library code path (or bundled dependency) that lazily compiles a function from a string
   will throw or silently fall back.
2. **No `process`.** `process.versions.node`, `process.release.name`, `process.platform`,
   `process.nextTick`, `process.env` are all absent. Node-detection heuristics that gate on
   `process.*` will pick the "browser" branch.
3. **No bare async-scheduling globals.** `setImmediate` / `clearImmediate` /
   `queueMicrotask` do not exist. Only `setTimeout` / `setInterval` are present.
4. **No `global` / `self`.** Only `globalThis` (which is the `Object.create(null)` context).
   Polyfills that attach to `global`/`self`/`exports` by feature-detection will attach to
   an unreachable target.
5. **Restricted `Buffer`.** Only the seven methods above — no `Buffer` constructor, no
   `Buffer.compare`, `Buffer.poolSize`, etc.
6. **Frozen prototypes.** Monkey-patching `Array.prototype`/`Object.prototype`/`JSON` etc.
   throws in strict mode.

## Observed library gaps (all consumer-worked-around today)

| # | Gap | Symptom in the sandbox | Consumer workaround | Upstream fix wanted |
|---|-----|------------------------|---------------------|---------------------|
| 1 | `writeFile()` Node-fs path gates on a full `process` and uses dynamic `import("node:fs")` | falls to the browser Blob path → "blob is not supported by this platform" | write via `pptx.write({ outputType:'nodebuffer' })` + `fs.writeFileSync` (exportPresentation — no process gate, no dynamic import) | a write path that works with neither `process` nor dynamic import (or document `write({outputType})` as the sandbox-safe path) |
| 2 | bundled JSZip `lib/utils.js` `delay()` calls a **bare** global `setImmediate(...)`; the `setimmediate` shim attaches to `self`/`global`/`exports` (none reachable) | "setImmediate is not defined" while writing the `.pptx` | define `globalThis.setImmediate`/`clearImmediate` (backed by `setTimeout`) before generating the zip | route zip generation through a `setImmediate` the library controls (`globalThis.setImmediate ?? setTimeout`), or ship a bundle banner that polyfills it on `globalThis` |
| 3 | string codegen anywhere in the library or a bundled dep | `EvalError: Code generation from strings disallowed` | the converter parses its own config without `new Function` | guarantee (and test) that no core/`/utils` path needs `eval`/`new Function`/`wasm` |

Gap 3 is a constraint the library should hold itself to rather than a single bug: any
feature that compiles a string to a function will be unusable in this sandbox. A CI guard
that runs a representative export inside a `codeGeneration:{strings:false}` context would
catch regressions.

## How the consumer models the sandbox (reusable test recipe)

The converter's test-suite builds a faithful context once and runs the real export through
it (`tests/sandbox-context.js` + `tests/sandbox-process.test.js` /
`sandbox-module-compat.test.js` / `sandbox-codegen.test.js`). The library could adopt the
same recipe directly as an upstream regression guard:

```js
const vm = require('vm')
const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } })
// expose ONLY: require(allowlisted), console, setTimeout/Interval (+clear), a restricted
// Buffer shim, URL, URLSearchParams, TextEncoder, TextDecoder.  Do NOT expose
// setImmediate, queueMicrotask, process, global, module, exports.  Freeze built-in
// prototypes; block Function.prototype.constructor.  Evaluate code wrapped in
// (async () => { "use strict"; <code> })().
```

A library-side test that generates a small deck through this context and asserts a
non-empty `nodebuffer` (with no `process`, no `setImmediate`, no codegen) would lock all
three gaps above at the source.

## Acceptance Criteria (upstream)

- [x] A documented sandbox-safe write path that needs neither a full `process` nor dynamic
      `import()` (Gap 1).
      **Implemented:** `website/docs/usage-saving.md` documents `write({ outputType: 'nodebuffer' })`
      as the sandbox-safe path; regression test `test/feature-sandbox-runtime.test.js`
      (faithful-context case) proves it works in a vm with no `process` or dynamic import.
- [x] Zip generation does not rely on a bare `setImmediate` global reachable only via
      `self`/`global`/`exports` (Gap 2).
      **Implemented:** `src/pptxgen.ts` `ensureSetImmediate()` polyfills
      `globalThis.setImmediate`/`clearImmediate` from `setTimeout`/`clearTimeout`
      (only when absent) immediately before `zip.generateAsync`. Regression test:
      `test/feature-sandbox-runtime.test.js` (deletes the globals, then proves a
      compressed `stream({ compression: true })` export still returns a non-empty
      nodebuffer; without the fix it throws `setImmediate is not defined`).
- [x] No core or `/utils` code path requires `eval`/`new Function`/`wasm` (Gap 3), with a
      `codeGeneration:{strings:false}` CI guard.
      **Implemented:** `test/feature-sandbox-runtime.test.js` codegen-guard test runs a
      full export inside `vm.createContext` with `codeGeneration: { strings: false, wasm: false }`.
- [x] A library regression test that exports a deck inside the faithful context above.
      **Implemented:** `test/feature-sandbox-runtime.test.js` faithful-context test exercises
      `stream({ compression: true })` through a real vm sandbox with no `setImmediate`,
      no `process`, no `global`, and codegen disabled.
