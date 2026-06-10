# Feature: `fit: 'grow'` — scale text UP to fill its box (complement to shrink)

> **Status:** Implemented
> **Created:** 2026-06-10
> **Target:** `@jsamuel1/pptxgenjs` core (autofit)
> **Found by:** the `html-to-pptx` converter rendering the reveal.js demo "FIT TEXT" slide
>   (reveal `r-fit-text`). Consumer-side detection/plan: `html-to-pptx/docs/feature-fit-text.md`.

## Problem

The library already supports `fit: 'shrink'` (emit `<a:normAutofit>` so text shrinks to
avoid overflow). The inverse — **grow a short headline to FILL the box width** — is what
reveal's `r-fit-text` and similar "fit text" features do, and there is no native mode for
it. Consumers must guess a point size from text length, which is imprecise without font
metrics the library is better placed to apply.

## Proposed API

Add a `fit` mode that scales up to fill:

```ts
slide.addText(text, { x, y, w, h, fit: 'fill' /* or 'grow' */, fontFace, color })
```

Behaviour:

- Choose the largest font size at which the text still fits the box `w`×`h` (single line
  for a display headline; wrap-aware for multi-line).
- Emit the appropriate autofit OOXML (`<a:normAutofit fontScale="...">` or a computed
  `sz`) so PowerPoint renders the filled size.
- Compose with existing options (align, color, bold). For a one-line headline, `fill`
  maximises height-constrained width usage.

## Why upstream

Autofit is already a library concern (`shrink` exists); `fill`/`grow` is the symmetric
case and needs the same OOXML/metrics machinery. Doing it in each consumer yields
inconsistent, metric-free guesses.

## Tests (this lives in the library)

Output-producing, so they belong here:

- A short string in a wide box with `fit:'fill'` emits a larger effective size than the
  same string with default sizing (assert `sz` / `fontScale`).
- A long string with `fit:'fill'` does not overflow the box (size is bounded).
- `fit:'shrink'` behaviour is unchanged (regression).

## Acceptance Criteria

- [x] `addText` accepts `fit: 'fill'` (a.k.a. `'grow'`) and scales text up to the box.
- [x] Emitted OOXML renders the filled size in PowerPoint and LibreOffice.
- [x] Existing `fit:'shrink'` / `fit:'none'` behaviour is unchanged.
