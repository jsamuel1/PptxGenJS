# Feature: First-Class Header / Footer Configuration (`p:hf`)

> **Status:** Proposed
> **Priority:** Medium — Phase 1 (matrix `⚠️ Partial`/`❌` → `✅`)
> **Matrix rows:** §6 — "Footer text placeholder", "Per-slide hf show/hide", "Notes/handout headers"

## Problem

Slide-number and date placeholders exist, and a footer placeholder is partially
supported, but there is no first-class API to configure headers/footers or to
toggle their visibility per slide/master. OOXML expresses this via `<p:hf>` on
the master/layout plus `<a:fld>` placeholders.

## Proposed API

```ts
// Presentation/master-level defaults
pptx.defineSlideMaster({
  title: 'MASTER',
  // ...
  headerFooter: {
    slideNumber: true,
    dateTime: { format: 'datetime1', value?: 'fixed text' },
    footer: 'Confidential',
  },
})

// Per-slide override (show/hide)
const slide = pptx.addSlide()
slide.headerFooter = { slideNumber: false, footer: false }  // hide on this slide
```

## What it generates (OOXML)

```xml
<!-- on slideMaster/slideLayout -->
<p:hf sldNum="1" hdr="0" ftr="1" dt="1"/>
<!-- footer/date/slidenum placeholders in the tree -->
<p:sp><p:nvSpPr>…<p:ph type="ftr"/>…</p:nvSpPr>
  <p:txBody>…<a:fld id="{GUID}" type="slidenum">…</a:fld></p:txBody>
</p:sp>
```

`<p:hf>` attributes toggle each element; per-slide visibility is controlled by
the slide's own `<p:hf>` (or by omitting the placeholder).

## Implementation location

- `src/core-interfaces.ts` — `HeaderFooterProps`; add to `SlideMasterProps` and
  `SlideBaseProps`.
- `src/gen-xml.ts` — emit `<p:hf>` on master/layout/slide; ensure `<a:fld>`
  placeholders for footer/date/slidenum are emitted consistently.

## Edge cases

- Date `format` maps to the `<a:fld type="datetime*">` variants; a fixed `value`
  emits literal text instead of an auto field.
- Per-slide `false` must reliably hide (set `<p:hf>` attr to `0` and/or omit ph).
- Default-off: decks not using hf config emit byte-identical XML.

## Test cases

```ts
// master headerFooter emits <p:hf sldNum/ftr/dt>; footer text appears in ph type="ftr"
// per-slide { slideNumber:false } hides the number on that slide only
```

## Acceptance

- Master + per-slide schema fixtures validate clean.
- Matrix §6 rows → `✅ Done`.
- `website/docs/*` documents header/footer config; `CHANGELOG.md` `Added`.
