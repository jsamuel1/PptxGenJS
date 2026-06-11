# Feature: HTML Entity Map Completeness (`/utils` html-dom)

> **Status:** Implemented
> **Priority:** High (paired with the converter's `feature-text-entity-decoding.md` — a
> conversion-quality-report *critical*)

## Problem

`src/utils/html-dom.ts` decodes only six named entities — `amp`, `lt`, `gt`, `quot`,
`apos`, `nbsp` — plus numeric (`&#NN;` / `&#xHH;`) forms. Real-world HTML presentations
use a much wider set: the html-to-pptx reference deck emits a literal `&middot;` into the
output PPTX (conversion-quality report, critical issue #1), and `&mdash;`, `&ndash;`,
`&hellip;`, `&rsquo;`/`&lsquo;`, `&rdquo;`/`&ldquo;`, `&bull;`, `&times;`, `&rarr;`,
`&copy;`, `&trade;`, `&deg;` are all common in deck copy. Any consumer of
`textOf()`/`parseHtml()` sees these as literal `&name;` text.

## API

No API change. `parseHtml`/`textOf` simply decode more named entities. Additionally,
**export the decoder** so consumers (the html-to-pptx converter's remaining string paths)
can reuse it instead of maintaining a copy:

```ts
// @jsamuel1/pptxgenjs/utils
export function decodeEntities(s: string): string
```

## Implementation location

- `src/utils/html-dom.ts` — extend the named-entity table (around line 78). Use the
  WHATWG HTML named-character-reference set restricted to the single-codepoint,
  commonly-used subset (~250 names: Latin-1 supplement, general punctuation, common
  symbols/arrows, `&times;`/`&divide;`, Greek letters). A full 2,231-name table is not
  required; document the chosen subset in the module comment.
- Export `decodeEntities` from `src/utils/index` (or wherever `/utils` re-exports).
- Preserve the existing double-encoding guarantee documented at html-dom.ts:83 — decode
  exactly one level (`&amp;lt;` → `&lt;`, never `<`), and the `outerHtml`/`esc`
  serialiser continues to re-encode the five XML-significant characters only.

## Edge cases

1. Unknown named entity (`&notareal;`) — left verbatim, never throws.
2. Case sensitivity — named references are case-sensitive per spec (`&Amp;` is not
   `&amp;`); match spec behaviour for the included subset.
3. Entities without trailing semicolons — out of scope (require the `;`), matching the
   current numeric-form behaviour.
4. One-level decode invariant — `&amp;middot;` decodes to `&middot;` (text), not `·`.
5. Surrogate-pair codepoints from `&#x1F3B5;` — already handled by the numeric path;
   add a regression test.

## Tests

- Unit: each new named entity decodes via `textOf`; unknown names pass through; the
  one-level invariant holds for `&amp;`-prefixed names.
- Round-trip: `parseHtml` → `outerHtml` re-encodes XML-significant chars exactly once.
- Regression fixture: a text run containing `Q&amp;A &middot; 7&times;` emits OOXML with
  `Q&amp;A · 7×` (schema suite).

## Consumers

- html-to-pptx converter (`docs/feature-text-entity-decoding.md` in that repo) — bumps
  this library and deletes its local entity handling.
