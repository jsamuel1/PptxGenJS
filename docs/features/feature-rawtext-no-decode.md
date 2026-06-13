# Feature: raw-text elements — no entity decoding in `<script>`/`<style>`

> **Status:** Implemented
> **Priority:** Low (correctness/conformance; coordinate with html-to-pptx before
> shipping — its CONFIG extraction currently relies on the non-conformant behaviour)

## Problem

The html-dom parser (`src/utils/html-dom.ts`) decodes character references in **all**
text nodes, including the contents of `<script>` and `<style>`. Per the HTML spec these
are raw-text elements: `&middot;` inside a script is the five characters `&middot;`,
not `·`. Verified consequences:

- A downstream converter mining script text (`textOf(script)`) receives pre-decoded
  strings, so any consumer that *also* decodes (the natural thing to do with "raw"
  script source) double-decodes — this caused a live double-decode bug in html-to-pptx
  CONFIG footers.
- CSS in `<style>` containing entity-like sequences (e.g. `content: "&quot;"`) is
  corrupted before the css-context layer ever sees it.

## Proposal

During parsing, skip entity decoding for text nodes whose parent element is a raw-text
element (`script`, `style`; also `textarea`/`title` are escapable-raw-text — decode
those per spec). `textOf()` then returns script/style content byte-faithful to source.

## Affected files

- `src/utils/html-dom.ts` — text-node creation: gate `decodeHtmlEntities` on the
  enclosing tag
- `test/feature-html-tree-query.test.js` (or new) — script/style fidelity cases

## Acceptance criteria

1. `textOf(query(parseHtml('<script>a = "&amp;" + "&middot;"</script>'), 'script')[0])`
   returns the source text verbatim (both sequences intact).
2. `<style>.x::before{content:"&quot;"}</style>` reaches `parseStyleSheets`/
   `extractCssCodepoints` undecoded.
3. Normal element text decoding unchanged (entity suite green); `textarea`/`title`
   decode per spec.
4. Documents without script/style entity-like sequences produce byte-identical output.

## Coordination (breaking for one known consumer)

html-to-pptx extracts CONFIG from `textOf(script)` and — because of the current
behaviour — must NOT decode it again (its task-11). When this ships, that polarity
flips: CONFIG sites should re-add `decodeEntities` only if deck authors are expected
to write entities in script strings (they aren't — plain JS). Most likely no
downstream change is needed, but its CONFIG guard test (`&amp;middot;` stays
`&middot;`) will surface the flip immediately. Release in a minor version with a
CHANGELOG `### Changed` entry naming `textOf` + script/style.
