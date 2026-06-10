# Feature: Node Arguments for `query` / `matches` / `closest` (cheerio containment parity)

> **Status:** Implemented (Released in 4.3.4)
> **Created:** 2026-06-10
> **Implemented:** `src/utils/html-dom.ts` (`query`/`matches`/`closest` node-arg overloads + exported `isAncestorOrSelf`); covered by `test/feature-html-tree-query.test.js` (node-arg + typed-`TypeError` cases).
> **Released:** `@jsamuel1/pptxgenjs@4.3.4` — `query`/`matches`/`closest` accept an HNode arg; `isAncestorOrSelf` exported. Verified by the consumer converter (tests/render-archetypes.test.js capability guard).
> **Extends:** `feature-html-tree-query.md` (the bounded selector engine)
> **Priority:** Medium — opaque failure today; small, well-scoped fix
> **Found by:** the `html-to-pptx` converter, rendering a real 14-slide deck (two-pane
>   app-mockup slides). Surfaced as a swallowed per-slide warning:
>   `render error: unsupported selector: [object Object]`.

## Problem

`feature-html-tree-query.md` maps the converter's cheerio surface onto the selector
helpers:

> `.find`→`query`, `.is`/`.has`→`matches`/`query(...).length`

That mapping holds for the **string-selector** forms. But cheerio's `.find`, `.is`, and
`.has` are also routinely called with a **node** (or node set), meaning *containment*,
not selector matching:

```js
// cheerio idiom: "is `node` a descendant of any element in this set?"
if ($(container).find(node).length) { /* skip already-captured subtree */ }
$(a).is(node)       // identity / membership
$(a).has(node)      // filter to elements that contain `node`
```

The library helpers accept **only strings**. Passing an `HNode` flows it into the
selector parser, which stringifies it to `"[object Object]"` and throws the bounded
engine's catch-all:

```
Error: unsupported selector: [object Object]
```

The error is opaque (it looks like a malformed selector, not a type mismatch), and the
capability cheerio offers natively is simply missing. The library *already has the
primitive* this needs — `isAncestorOrSelf(a, b)` is defined internally in
`src/utils/html-dom.ts` and used by `closest`/`query` — it is just not reachable through
the public helpers when the argument is a node.

## Why this should be in PptxGenJS

- It is **parity with the documented cheerio mapping**, not new surface area: the
  feature doc already promises these helpers cover the converter's `.find`/`.is`/`.has`
  usage.
- The supporting primitive (`isAncestorOrSelf`) is already implemented and tested; this
  exposes it through the existing entry points.
- It removes the only remaining reason a consumer would keep a node-containment helper
  of its own (the reference converter currently shims it — see "Consumer workaround").
- It is finite and bounded — no move toward a CSS-complete engine.

## Proposed API

Overload the three node-vs-selector helpers to accept an `HNode` (or `HNode[]`) in
addition to a `string`:

```ts
// string selector (today) OR an HNode for containment/identity (new)
export function query(root: HNode, selector: string | HNode): HNode[]
export function matches(node: HNode, selector: string | HNode): boolean
export function closest(node: HNode, selector: string | HNode): HNode | null
```

Semantics when the argument is a node `t`:

| Call | Meaning | Result |
|------|---------|--------|
| `query(root, t)` | descendant test | `[t]` if `t` is a descendant of `root` (not `root` itself), else `[]` |
| `matches(node, t)` | identity | `node === t` |
| `closest(node, t)` | ancestor-or-self identity | `t` if `t` is `node` or an ancestor of `node`, else `null` |

This mirrors cheerio: `$(root).find(t)` returns `t` iff contained; `$(node).is(t)` is
identity; `$(node).closest(t)` walks ancestors for `t`. All three are expressible via
the existing `isAncestorOrSelf` with no new traversal logic.

### Alternative (minimum viable): a clearer throw

If overloading is judged out of scope for the bounded engine, the engine should at least
**fail with a typed, actionable error** instead of `unsupported selector: [object Object]`:

```
TypeError: query(root, selector): selector must be a string; received an HNode.
  For containment use `isAncestorOrSelf(root, node)`.
```

…and `isAncestorOrSelf` should be **exported** from `/utils` so consumers have a public
containment primitive. (The overload above is preferred; this is the floor.)

## Test cases

```ts
const { parseHtml, query, queryOne, matches, closest } = require('@jsamuel1/pptxgenjs/utils')

const root = parseHtml('<div class="a"><section><span id="x">hi</span></section></div>')
const a    = queryOne(root, '.a')
const sec  = queryOne(root, 'section')
const span = queryOne(root, '#x')

// query(root, node) — descendant test
assert(query(a, span).length === 1)          // span is inside .a
assert(query(a, span)[0] === span)
assert(query(sec, a).length === 0)            // a is NOT inside section
assert(query(a, a).length === 0)              // self is not a descendant of self

// matches(node, node) — identity
assert(matches(span, span) === true)
assert(matches(span, sec) === false)

// closest(node, node) — ancestor-or-self identity
assert(closest(span, a) === a)                // a is an ancestor of span
assert(closest(span, span) === span)          // self
assert(closest(a, span) === null)             // span is a descendant, not an ancestor

// strings still work unchanged
assert(query(root, 'section').length === 1)
assert(matches(span, '#x') === true)
```

## Consumer workaround (until shipped)

The `html-to-pptx` converter's `$` shim (its thin cheerio replacement) now special-cases
a node/`Q` argument in `find`/`has` and walks the `HNode.parent` chain itself
(`contains(anc, desc)`), instead of forwarding the node to the string-only `query`. It
also added a `hasClass()` method (`node.classes.indexOf(cls) !== -1`) that the shim was
missing entirely — orthogonal to this gap, but found in the same render-path debugging.
Covered by that repo's `tests/render-archetypes.test.js`. Once this overload ships, the
shim's hand-rolled `contains` can delegate to `query(anc, node)` / `closest(node, anc)`.

## Acceptance Criteria

- [ ] `query`/`matches`/`closest` accept an `HNode` argument with the semantics above
- [ ] string-selector behaviour is unchanged (existing grammar tests still pass)
- [ ] `isAncestorOrSelf` is exported from `/utils` (public containment primitive)
- [ ] passing any other non-string/non-node value throws a typed `TypeError`, never
      `unsupported selector: [object Object]`
- [ ] `types/utils.d.ts` updated; `test/feature-html-tree-query.test.js` extended
