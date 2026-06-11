# Feature: CssContext Layout Properties — extend cascade-lite from colours to layout

> **Status:** Reopened — review fixes required (see "Review findings" below; was
> prematurely marked Implemented in 3e23398a / released 4.3.13 without the public export)
> **Priority:** Medium (unblocks deleting a dozen inline-style regexes in the
> html-to-pptx converter; prerequisite-free but most valuable after that repo's
> composition refactor lands)

## Problem

`src/utils/css-context.ts` resolves **colours** through a shared "cascade-lite" context:
inline `style` > simple single-class rules from `<style>` blocks > `var()` against
`:root`. Layout properties get no such treatment — every layout decision in consumers is
an inline-style-only regex. The html-to-pptx converter greps
`[style*="grid-template-columns"]`, `[style*="flex-wrap"]`, `column-count`, `width: Npx`,
`flex: 1`, `flex-direction: column`, `border-radius: 50%`, `position: absolute` straight
out of `style` attributes. Any presentation framework that declares layout in **classes**
(which is every real framework — the reference deck's own `.cap-grid { display: grid;
grid-template-columns: repeat(3, 1fr) }` lives in a `<style>` block) is invisible to all
of those checks, and card-grid detection only works there by falling back to class-NAME
pattern matching.

## API

Extend the existing context — no new entry point:

```ts
// CssContext already carries rootVars + classRules with arbitrary decls.
// Add a resolved-declaration lookup that applies the cascade-lite precedence:
export function declOf(node: HNode, prop: string, ctx: CssContext): string | undefined
//   prop: any CSS property name; returns inline-style value if present,
//   else the last matching single-class rule's value, with var() resolved.

// Convenience interpreters built on declOf (each returns undefined when absent):
export function gridColumnsOf(node: HNode, ctx: CssContext): number | undefined
export function flexInfoOf(node: HNode, ctx: CssContext):
  { direction: 'row'|'column', wrap: boolean, grow: number|undefined } | undefined
export function columnCountOf(node: HNode, ctx: CssContext): number | undefined
export function sizeOf(node: HNode, ctx: CssContext):
  { wPx?: number, hPx?: number } | undefined
```

`buildCssContext(html)` (or the existing constructor path) must retain **all**
declarations from class rules, not just the colour-relevant ones, so `declOf` can answer
for layout props. Scope stays cascade-lite: single-class selectors, last-declared wins,
inline > class — no specificity ranking, no descendant/combinator selectors, no
`@media` (same documented limits as today's colour scope).

## Implementation location

- `src/utils/css-context.ts` — `declOf` + the interpreters; widen the class-rule decl
  capture if it currently filters to colour props.
- `parse-cards.ts` / `parse-content.ts` — adopt `declOf` for their own grid/flex
  detection so `parseCards`/`parseTimeline` recognise class-declared grids (this is the
  generalisation payoff: card grids detected by *layout*, not class-name suffix).
- Keep byte-identical output for documents whose layout is inline-declared or absent
  (default-off invariant: new recognition only adds matches where there were none).

## Edge cases

1. `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))` — return the best-effort
   track count (`undefined` for auto-fit is acceptable; do not guess).
2. Conflicting inline vs class declarations — inline wins (assert in tests).
3. `var(--cols)`-driven values — resolved through `rootVars` before interpretation.
4. Multiple classes on one element each carrying rules — last-declared rule in document
   order wins (matching the existing colour behaviour).
5. Shorthand `flex: 1 0 auto` and bare `flex: 1` — both yield `grow: 1`.

## Tests

- Unit tests per interpreter: inline, class-rule, var()-resolved, and absent cases.
- `parseCards` fixture: a grid declared *only* via a class rule (`.grid { display:grid;
  grid-template-columns: 1fr 1fr 1fr }`) detects 2 rows × 3 cards.
- Regression: all existing parse-cards/extractor fixtures byte-identical.

## Consumers

- html-to-pptx converter: `detectColumns`, `detectGridIsCapLike`, `detectTimeline`'s
  grid/flex guards, `detectIconRows`, `renderAppMockup`'s sidebar/main split, and
  `avatarOf` all migrate to these helpers and drop their inline-only regexes (tracked in
  that repo's PROMPT.md under the composition/adapters work).

## Review findings (2026-06-12 — must close before re-marking Implemented)

Independent review of `24120c7c` (Slice 1) and `23ec8f2f` (Slice 2). Bugs were verified
by executing the built helpers, not by reading the diff. Items 1–4 block release of a
usable API; release 4.3.13 shipped with item 1 unresolved.

1. **CRITICAL — not exported.** None of `declOf`/`gridColumnsOf`/`flexInfoOf`/
   `columnCountOf`/`sizeOf` (nor `parseStyleSheets`/`cssProp`/`CssContext`/`EMPTY_CSS`)
   are re-exported from `src/utils.ts` or declared in `types/utils.d.ts`, so the
   published `@jsamuel1/pptxgenjs/utils` surface cannot reach them. The test-only rollup
   entry bundling `src/bld/css-context.js` is a workaround — delete it once exported and
   point the test at `src/bld/utils.cjs.js`.
2. **MAJOR — `gridColumnsOf` miscounts functional tracks.** Whitespace-splitting counts
   `minmax(0, 1fr)` as 2 tracks: `repeat(3, minmax(0, 1fr))` → 6 (Tailwind `grid-cols-3`
   emits exactly this; true 3); `200px repeat(2, 1fr)` → 2 (standalone tracks dropped;
   true 3); `calc(100% - 20px) 1fr` → 4 (true 2). Fix: paren-aware depth-0 tokenizer so
   each `minmax()`/`fit-content()`/`calc()` is one track. The converter's existing
   regexes get the Tailwind case right — migrating onto the helper before this fix is a
   regression.
3. **MAJOR — `!important` never stripped.** Leaks into `declOf` values and is counted as
   a grid track; `display: grid !important` defeats `findContainer`'s strict
   `disp === 'grid'` equality. Strip in `parseStyle`/`cssProp`; loosen the equality.
4. **MAJOR — `@media` contents applied unconditionally.** The flat rule regex in
   `parseStyleSheets` captures rules inside `@media` blocks; last-declared-wins lets a
   mobile breakpoint (`grid-template-columns: 1fr`) override the desktop value. Skip
   `@…{…}` blocks. Out of scope must mean ignored, not honoured.
5. **MINOR — `flexInfoOf`:** `flex: auto` shadows an explicit `flex-grow: 2` (fall
   through when the shorthand has no leading number); no `flex-flow` shorthand support.
6. **MINOR — tests/consistency:** the class-rule-grid fixture is 1×2, weaker than the
   spec's 2×3; `isStructurallySimilar`'s container-rejection check reads raw
   `sibling.style.display` and misses class-rule-declared sibling containers — a path
   Slice 2 made reachable.
