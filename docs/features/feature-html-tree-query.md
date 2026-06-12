# Feature: Export the HTML Tree-Builder + a Minimal Selector Engine — `parseHtml()` / `query()`

> **Status:** Implemented
> **Implemented:** `src/utils/html-dom.ts` (shared tree-builder + bounded selector engine), re-exported from `src/utils.ts`; types in `types/utils.d.ts`; tests `test/feature-html-tree-query.test.js`. `src/utils/parse-cards.ts` now imports the shared parser (de-duplicated, no behaviour change).
> **Target:** `@jsamuel1/pptxgenjs/utils` (next minor)
> **Implements (when built):** promote the private tree-builder in `src/utils/parse-cards.ts` to a shared `src/utils/html-dom.ts`; export `parseHtml`, `HNode`, and a small query layer from `src/utils.ts`; types in `types/utils.d.ts`; tests `test/feature-html-tree-query.test.js`
> **Depends on:** nothing new — reuses the parser that already backs `parseCards()` / `parseSvg()` / `extractThemeFromCSS()`
> **Priority:** High — this is the missing piece that lets an HTML→PPTX converter drop its `cheerio` dependency entirely

## Problem

The `/utils` package already contains a pure, dependency-free, stack-based HTML
tree-builder (`buildTree` in `src/utils/parse-cards.ts`) plus traversal helpers
(`elements`, `textOf`, `classMatch`, `findFirst`, `isAncestorOrSelf`, `isExcluded`).
This is the same "no cheerio, no DOM, no browser" parser used by `parseCards()`.

But it is **entirely private** — `src/utils.ts` exports only `parseCards`, `parseSvg`,
`extractThemeFromCSS`, `resolveIconFonts`. And the helpers that *are* there are
**predicate/regex based**, not selector based.

As a result, a consumer that needs general HTML querying (not just the card-grid or
SVG or theme sub-cases the library already covers) has no choice but to pull in a full
DOM library. The `html-to-pptx` converter does exactly this: it loads the whole deck
with `cheerio.load(rawHtml)` and runs its slide classification/extraction over a broad
cheerio surface:

- `.find()` with CSS selectors — class (`.timeline-item`), tag (`h1,h2,h3`),
  descendant (`ul li`), child combinator (`.timeline > *`), universal (`*`), and
  **attribute-substring** (`[class*="slide"]`, `[style*="border-radius"]`,
  `[data-demo]`)
- `.attr`, `.text`, `.children`, `.parent`, `.closest`, `.is`, `.has`, `.first`,
  `.filter`, `.each`, `.map`, `.toArray`, `.clone`, `.contents`, `.add`, `.eq`

The library already shoulders the hard part (a correct, tolerant, zero-dependency
parser). Exposing a thin, **bounded** query layer over it removes the converter's only
remaining reason to depend on cheerio — and does so for any future consumer too. This
is the same "don't re-implement DOM work in every converter" rationale that justified
`parseCards`/`parseSvg`/`extractThemeFromCSS`.

## Question: Should this be in PptxGenJS?

**Arguments for:**
- The parser is *already in the package*; only the export + a query helper are new.
- It is format-agnostic and OOXML-independent (HTML string → node tree → query), the
  same shape as the existing utils.
- It unblocks full cheerio removal in the reference converter and prevents every
  HTML→PPTX consumer from re-bundling a ~180 KB DOM library.

**Arguments against:**
- PptxGenJS is fundamentally an OOXML generator; a general HTML query API drifts toward
  "HTML toolkit."
- A *full* selector engine (specificity, `:nth-child`, combinator soup, `@media`) is a
  rabbit hole the library should not own.

**Recommended:** ship it, but **bounded** — a documented, minimal selector subset (see
below), not a CSS-complete engine. Keep it on the optional `/utils` subpath, never on
the core `PptxGenJS` class (consistent with `extractThemeFromCSS`'s decision). The
parser is reused, the query surface is small and finite, and the scope line is explicit.

## Proposed API

```ts
import { parseHtml, query, queryOne, closest, matches, textOf, attr } from '@jsamuel1/pptxgenjs/utils'

const root: HNode = parseHtml(htmlString)        // tolerant; never throws on bad HTML

const slides   = query(root, 'section.slide')    // HNode[] (document order)
const heading  = queryOne(slide, 'h1,h2')        // HNode | null
const pills    = query(slide, '[class*="badge"], [class*="pill"]')
const box      = closest(node, '.flow, .product-anim')   // nearest ancestor-or-self match
const isCard   = matches(node, '[class*="card"]')        // boolean
const text     = textOf(node)                    // concatenated descendant text (existing helper)
const cls      = attr(node, 'class')             // string | undefined
```

### `HNode` (already exists internally — promote + freeze the shape)

```ts
export interface HNode {
  tag: string                       // lowercased; '#text' for text nodes
  attrs: Record<string, string>
  classes: string[]
  style: Record<string, string>     // parsed inline style declarations
  children: HNode[]
  parent: HNode | null
  text?: string                     // present on '#text' nodes
  raw?: string                      // verbatim outer markup for captured `<svg>` subtrees
}
```

### Supported selector grammar (the bounded subset)

This is the **entire** grammar — anything outside it throws a clear error at parse time
(so a consumer can't silently get wrong results):

| Selector | Example | Notes |
|----------|---------|-------|
| universal | `*` | |
| type | `div`, `section` | tag name, case-insensitive |
| class | `.slide`, `.timeline-item` | a class token |
| id | `#main` | |
| attribute present | `[data-demo]` | |
| attribute exact | `[data-x="y"]` | |
| attribute substring | `[class*="slide"]` | the `*=` operator (heavily used) |
| compound | `section.slide`, `span[class*="brand"]` | type + class/attr, no spaces |
| descendant | `ul li`, `.timeline span` | whitespace combinator |
| child | `.timeline > *`, `body > section` | `>` combinator |
| selector list | `h1,h2,h3`, `.quote-attr, cite` | comma = OR |

**Explicitly out of scope** (documented, throws): `:nth-child`/pseudo-classes,
`::before`/pseudo-elements, sibling combinators (`+`, `~`), `^=`/`$=`/`~=`/`\|=`
attribute operators, namespaces, `@media`, specificity ranking. A consumer needing the
real cascade still needs a browser DOM — and `parseCards`/`extractThemeFromCSS` already
document that same limitation.

### Helper functions

```ts
export function parseHtml(html: string): HNode
export function query(root: HNode, selector: string): HNode[]      // querySelectorAll
export function queryOne(root: HNode, selector: string): HNode | null
export function closest(node: HNode, selector: string): HNode | null
export function matches(node: HNode, selector: string): boolean
export function textOf(node: HNode): string                        // existing
export function attr(node: HNode, name: string): string | undefined
export function clone(node: HNode): HNode                          // deep copy (for non-mutating reads)
export function outerHtml(node: HNode): string                     // serialize a node (uses `raw` for captured <svg>)
```

These cover the converter's cheerio surface 1:1: `.find`→`query`, `.closest`→`closest`,
`.is`/`.has`→`matches`/`query(...).length`, `.attr`→`attr`, `.text`→`textOf`,
`.parent`/`.children`→`node.parent`/`node.children`, `.clone`→`clone`,
`.first`/`.toArray`/`.map`/`.filter`/`.each`→native array ops on `query()` results.

## Implementation location

- `src/utils/html-dom.ts` — **move** `HNode`, `buildTree` (export as `parseHtml`),
  `elements`, `textOf`, `classMatch`, `isAncestorOrSelf` out of `parse-cards.ts`; add a
  small selector parser + matcher (`query`/`queryOne`/`closest`/`matches`), and `attr`
  / `clone`.
- `src/utils/parse-cards.ts` — import from `html-dom.ts` instead of defining its own
  copies (no behaviour change; same parser, now shared). This de-duplicates the
  tree-builder that `parse-cards` and `resolve-icon-fonts` would otherwise both carry.
- `src/utils.ts` — re-export `parseHtml`, `query`, `queryOne`, `closest`, `matches`,
  `textOf`, `attr`, `clone`, and the `HNode` type.
- `types/utils.d.ts` — add `HNode` + the function signatures.
- `test/feature-html-tree-query.test.js` — grammar coverage + tolerance tests.

## Test cases

```ts
const { parseHtml, query, queryOne, closest, matches } = require('@jsamuel1/pptxgenjs/utils')

const root = parseHtml('<section class="slide"><ul><li>a</li><li>b</li></ul>' +
  '<span class="brand-name">Acme</span><div class="timeline"><div>1</div><div>2</div></div></section>')

// type + class + list + descendant + child + attr-substring
assert(query(root, 'section.slide').length === 1)
assert(query(root, 'ul li').length === 2)
assert(query(root, '.timeline > *').length === 2)
assert(query(root, 'h1,h2,h3').length === 0)
assert(queryOne(root, 'span[class*="brand"]').text === 'Acme' /* via textOf */)
assert(query(root, '[class*="time"]').length >= 1)

// closest / matches
const li = query(root, 'li')[0]
assert(closest(li, '.slide') !== null)
assert(matches(query(root, '.timeline')[0], '[class*="time"]'))

// tolerance: malformed/unclosed HTML never throws
assert(parseHtml('<div><span>oops').children.length >= 1)

// unsupported selector throws a clear error (not silent wrong answer)
let threw = false
try { query(root, 'li:nth-child(2)') } catch (e) { threw = /unsupported|selector/i.test(e.message) }
assert(threw)
```

## Impact on the `html-to-pptx` converter

This is the dependency that the converter's full cheerio removal waits on (tracked in
that repo's `docs/features/feature-parsecards-icon-resolver-adoption.md` → "Out of scope /
future"). Once shipped, the converter replaces `const $ = cheerio.load(rawHtml)` and
its ~280 cheerio call-sites with `parseHtml` + `query`/`closest`/`matches`/`textOf`,
and drops `cheerio/slim` from `package.json` and the esbuild bundle (shrinking it and
removing the only non-allowlisted dependency from the sandbox build). No converter
*behaviour* changes — only the DOM mechanics.
