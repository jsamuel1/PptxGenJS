# Feature: `resolveFontFiles` — match font files by internal family name

> **Status:** Implemented
> **Priority:** High — `embedFont` is unusable for any consumer that downloads fonts
> under their real distribution names. Sibling of `resolveIconFonts`.
> Source: 2026-06-14 field repro — a converted deck wanting "Inter" had
> `Inter-Regular.ttf` sitting in its fonts dir and still embedded nothing, because the
> only matcher is downstream filename-guessing (`<Family>.ttf`).

## Problem

`embedFont({ family, regular, bold, italic })` (gen-objects / the embed path) trusts
the caller to supply correct file paths. The library offers **no way to find which
file in a directory IS a given family** — so every consumer reinvents filename
guessing, and gets it wrong: distributed fonts are named `<Family>-Regular.ttf`,
`<Family>-VariableFont_wght.ttf`, `Inter_18pt-Regular.ttf`, or hash-named by a CDN,
never the bare `<Family>.ttf` the guess assumes. The font's *real* identity lives in
its OpenType `name` table, which nothing reads.

## Proposal

A new `/utils` export, structure-driven like `resolveIconFonts`:

```ts
resolveFontFiles(
  source: string | string[],            // a directory, or explicit file paths
  families: string[],                   // wanted family names, e.g. ['Inter','Roboto']
  opts?: { exts?: string[] }            // default ['.ttf','.otf','.ttc','.woff','.woff2']
): Map<string, { family: string; regular?: string; bold?: string; italic?: string }>
```

- Parse each candidate file's **sfnt `name` table**: family = nameID 16 (typographic)
  ?? nameID 1; subfamily = nameID 17 ?? nameID 2; also read the OS/2 / `head`
  bold/italic bits. (For `.woff`/`.woff2`, read the wrapper header to reach the
  embedded sfnt — or document those as a follow-up and resolve ttf/otf/ttc first.)
- Match `families` against resolved family names **case-insensitively, exact** (no
  substring — "Inter" must not match "Inter Tight"); pick Regular/Bold/Italic per
  subfamily. Return only families that resolved.
- Pure: `fs.readFileSync` + buffer parsing, **zero new dependencies, sandbox-safe**
  (no network, no `process`). Export a lower-level `readFontName(buf): { family,
  subfamily }` too — useful to consumers building a cache manifest.

## Rejected alternative (records the direction)

Filename guessing (the status quo, and the converter's `FONT_FILE_CANDIDATES`):
brittle, locale/convention-specific, and overfits to whatever names one consumer's
download happened to use. Family-name-from-the-file is the inverse — filename becomes
a non-factor. If a future change reverses this posture, add an ADR.

## Affected files

- `src/utils/resolve-font-files.ts` (new) + `src/utils/read-font-name.ts` (or one file)
- `src/utils.ts` export + `types/utils.d.ts` declarations
- `test/feature-font-family-resolver.test.js` + fixtures (a real `Inter-Regular.ttf`
  and an FA `fa-solid-900.ttf` under `test/fixtures/foreign/fonts/`)

## Acceptance criteria

1. Executed against the public entry: `resolveFontFiles(dir, ['Inter'])` returns
   `Inter` → `{ regular: '…/Inter-Regular.ttf' }` for a dir containing
   `Inter-Regular.ttf` (and also for `Inter-VariableFont_slnt,wght.ttf`).
2. `resolveFontFiles(dir, ['Font Awesome 6 Free'])` resolves `fa-solid-900.ttf` by its
   internal name (subfamily "Solid") — the explicit goal being that the downstream
   converter can then DELETE its hardcoded `FONT_FILE_CANDIDATES` FA table entirely
   (no font, not even FA, needs a filename special-case).
3. Exact-family discipline: a dir with both `Inter` and `Inter Tight` resolves each to
   its own file; "Inter" never returns the Tight file.
4. API parity green (export ↔ typings); no network in any test; CHANGELOG `### Added`.

## Coordination

The converter's `feature-runtime-icon-font-cache.md` consumes this: cache fonts keyed
by resolved family in its manifest, and `embedDeckFonts` calls `resolveFontFiles`
instead of `findFontFile`/`FONT_FILE_CANDIDATES`. Ship in a normal minor; the
converter bumps the dep and deletes its filename-guessing.
