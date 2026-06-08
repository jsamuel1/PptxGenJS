# Feature: First-Class Header / Footer Configuration (`p:hf`)

> **Status:** Implemented — master/layout config (slice 1.5) + per-slide override (slice 1.6) + notes-master header/footer (slice 1.7) done; handout-master out-of-scope (no handout-master writer)
> **Priority:** Medium — Phase 1 (matrix `⚠️ Partial`/`❌` → `✅`)
> **Matrix rows:** §6 — "Footer text placeholder" (✅ Done), "Per-slide hf show/hide" (✅ Done), "Notes/handout headers" (⚠️ Notes done via slice 1.7; handout out-of-scope)
>
> **Implemented:** `HeaderFooterProps` (`src/core-interfaces.ts`) + `headerFooter`
> on `SlideMasterProps`; `createSlideMaster` STEP-4 stash (`src/gen-objects.ts`);
> derived `<p:hf>` in `makeXmlLayout` + footer/date placeholders in
> `slideObjectToXml` STEP-4b (`src/gen-xml.ts`). Per-slide override (slice 1.6):
> a public `headerFooter` accessor + `_headerFooter` field on the `Slide` class
> (`src/slide.ts`, mirroring the `slideNumber` accessor) feeds the already-wired
> STEP-4b per-slide ftr/dt placeholders; `<p:hf>` is invalid on `CT_Slide` so the
> per-slide `slideNumber` flag is a no-op (use `slide.slideNumber`) and the scope
> is footer + date only. Tested by the `header-footer` + `header-footer-per-slide`
>> schema fixtures (`test/schema.test.js`). The master's hardcoded
> `<p:hf sldNum="0" .../>` is intentionally left untouched.
> Notes-master (slice 1.7): a presentation-level `notesMaster` accessor +
> `_notesMaster` field on the `PptxGenJS` class (`src/pptxgen.ts`, mirroring the
> `theme` setter) feeds the parameterized `makeXmlNotesMaster(headerFooter?)`
> (`src/gen-xml.ts`), which injects `<p:hf>` after `</p:clrMap>` (CT_NotesMaster
> child order, before `<p:notesStyle>`) and fills the existing empty hdr/ftr
> placeholder text. The notes master DOES support a header, so `hdr` is live.
> Default-off emits a byte-identical `notesMaster1.xml`. Tested by the
> `header-footer-notes-master` schema fixture. Handout-master headers remain
> out-of-scope (no `makeXmlHandoutMaster` writer exists).

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
