# Feature: Syntax-highlighted code rendering helper

> **Status:** Implemented
> **Created:** 2026-06-10
> **Target:** `@jsamuel1/pptxgenjs` core (a code render helper) + `/utils` (tokenizer)
> **Found by:** the `html-to-pptx` converter rendering the reveal.js demo "Pretty Code" /
>   "With Animations" slides. Consumer-side detection/plan: `html-to-pptx/docs/feature-code-blocks.md`.

## Problem

HTML presentation frameworks render source code with `<pre><code class="hljs <lang>">`
(highlight.js) or `class="language-<lang>"` (Prism). Producing a faithful PPTX of a code
slide needs more than a monospace text box: the value is in the **token colouring** (and,
for reveal, **line-range emphasis** via `data-line-numbers="|4,8-11|17"`). Every HTML→PPTX
consumer would otherwise re-implement tokenizing + colour mapping.

## Proposed API

A library helper that turns source text + language into PptxGenJS text runs (or a ready
text object), so consumers don't ship a highlighter:

```ts
// /utils — pure, dependency-free, no OOXML
export function tokenizeCode(source: string, lang?: string): Array<{ text: string; token: TokenKind }>
//   TokenKind: 'keyword'|'string'|'comment'|'number'|'function'|'operator'|'plain'|...

// core — map tokens to runs against a code theme, ready for slide.addText(...)
export function codeRuns(source: string, opts?: {
  lang?: string
  theme?: Record<TokenKind, string>   // token -> hex; sensible default (monokai-like)
  lineNumbers?: boolean
  highlightLines?: number[]           // emphasise these 1-based lines (dim the rest)
}): TextRun[]
```

Rendering requirements the library should guarantee for code runs:

- **Monospace font** with `<a:cs>`/`<a:latin>` set to a mono family; preserve **leading
  whitespace** (OOXML collapses runs of spaces unless `xml:space="preserve"` / explicit
  spacing — the library must keep indentation intact).
- **Hard line breaks** per source newline (`breakLine`).
- **Default code theme** so a consumer gets reasonable colours with zero config; overridable.
- Optional **line emphasis**: dim non-highlighted lines (reveal `data-line-numbers`).

## Why upstream

- Tokenizing + a portable code theme is reusable, OOXML-independent, and large to
  re-implement per consumer.
- Whitespace/indentation fidelity in OOXML is exactly the kind of low-level detail the
  library already owns for other text features.

## Tests (this lives in the library)

These are **output-producing** tests, so they belong here, not in the consumer:

- `tokenizeCode('const x = "hi" // c', 'javascript')` yields keyword/string/comment tokens.
- `codeRuns(...)` runs use a monospace family and preserve a 4-space indent (assert the
  emitted run text keeps leading spaces / the paragraph keeps indentation).
- `highlightLines:[2]` dims lines 1 and 3 (assert colour/alpha differs from line 2).
- Empty source yields zero runs and never throws.

## Acceptance Criteria

- [x] `/utils` exports `tokenizeCode` (dependency-free) with a documented `TokenKind` set.
- [x] core exports `codeRuns` producing monospace, indentation-preserving, optionally
      line-emphasised runs with a default theme.
- [x] OOXML keeps leading whitespace and per-line breaks (regression-tested).
