# Feature: Hover Hyperlinks & Action Jumps (`a:hlinkHover`, `a:hlinkClick action=`)

> **Status:** Implemented — hover done (slice 3.2); action jumps done (slice 3.3)
> **Priority:** Medium — Phase 3 (matrix `❌ Missing` → `✅`)
> **Matrix rows:** §4 Hyperlinks & actions — "Hover hyperlink", "Action jumps"

> **Implemented (action jumps, slice 3.3):** `hyperlink.action: 'nextSlide' |
> 'prevSlide' | 'firstSlide' | 'lastSlide' | 'endShow' | 'slide'` on
> `HyperlinkProps` (`src/core-interfaces.ts`). The five navigation verbs emit
> `<a:hlinkClick r:id="" action="ppaction://hlinkshowjump?jump=<verb>"/>` (verb
> map in `src/gen-xml.ts` `HLINK_ACTION_VERBS`: `nextSlide→nextslide`,
> `prevSlide→previousslide`, `firstSlide→firstslide`, `lastSlide→lastslide`,
> `endShow→endshow`) at all three emit sites (text run, shape `<p:cNvPr>`, image
> `<p:cNvPr>`) with **no relationship** (empty `r:id`). `action: 'slide'` (with
> `slide: N`) reuses the existing slide-jump path (`ppaction://hlinksldjump` +
> slide rel) — no new branch. The text-run `!url && !slide` throw guard and
> `createHyperlinkRels`'s `!url && !slide` ERROR-log guard (`src/gen-objects.ts`)
> were relaxed so a navigation action is allowed/skipped silently (no rel, no
> error). `action` and `url` are mutually exclusive (URL wins + `console.warn`).
> NOTE: a textbox is a `<p:sp>`, so `addText` with a nav action emits the action
> at BOTH its `<p:cNvPr>` (shape) level and its run `<a:rPr>` level — consistent
> with how url/slide hyperlinks already behave for textboxes. Test:
> `test/schema.test.js` "slide with navigation action jumps (ppaction://hlinkshowjump)".

> **Implemented (hover, slice 3.2):** `hyperlink.on: 'click' | 'hover'` on
> `HyperlinkProps` (`src/core-interfaces.ts`). `on: 'hover'` swaps the emitted
> element at all three hyperlink emit sites in `src/gen-xml.ts` (text run, shape
> `<p:cNvPr>`, image `<p:cNvPr>`). **Correction to the title/problem below:** the
> hover element name is NOT uniformly `<a:hlinkHover>`. DrawingML names it per
> parent complex type — `CT_TextCharacterProperties` (text runs) uses
> **`<a:hlinkMouseOver>`**, while `CT_NonVisualDrawingProps` (shape/image
> `<p:cNvPr>`) uses **`<a:hlinkHover>`** (both `CT_Hyperlink`). Using
> `<a:hlinkHover>` on a text run is schema-INVALID (caught by the OOXML
> validator). Hover reuses the existing rel machinery unchanged. Test:
> `test/schema.test.js` "slide with hover hyperlink (a:hlinkHover)".

## Problem

Only click hyperlinks (`<a:hlinkClick>` to a URL or slide) are supported.
OOXML also supports:
- **Hover** hyperlinks (`<a:hlinkHover>`) — activate on mouse-over.
- **Action jumps** — `<a:hlinkClick action="ppaction://hlinkshowjump?jump=..."/>`
  for next/previous/first/last/named slide navigation (interactive decks,
  kiosk navigation buttons).

## Proposed API

```ts
// Hover hyperlink
slide.addText('Hover me', { hyperlink: { url: 'https://x.com', tooltip: 'Open', on: 'hover' } })

// Action jump (no URL — a navigation action)
slide.addShape('actionButtonForwardNext', {
  x: 1, y: 1, w: 1, h: 1,
  hyperlink: { action: 'nextSlide' },   // 'nextSlide'|'prevSlide'|'firstSlide'|'lastSlide'|'endShow'
})

// Jump to a named/indexed slide
slide.addText('Go to summary', { hyperlink: { action: 'slide', slide: 5 } })
```

## What it generates (OOXML)

```xml
<!-- hover -->
<a:hlinkHover r:id="rId3" tooltip="Open"/>
<!-- action jumps -->
<a:hlinkClick r:id="" action="ppaction://hlinkshowjump?jump=nextslide"/>
<a:hlinkClick r:id="" action="ppaction://hlinkshowjump?jump=lastslide"/>
<a:hlinkClick r:id="rId4" action="ppaction://hlinksldjump"/>  <!-- named/indexed slide -->
```

Action URIs map: `nextSlide → nextslide`, `prevSlide → previousslide`,
`firstSlide → firstslide`, `lastSlide → lastslide`, `endShow → endshow`;
`slide` uses `hlinksldjump` with a relationship to the target slide.

## Implementation location

- `src/core-interfaces.ts` — extend `HyperlinkProps` with `on?: 'click'|'hover'`
  and an `action?` discriminator (`'nextSlide'|...|'slide'` + `slide?: number`).
- `src/gen-xml.ts` — emit `<a:hlinkHover>` vs `<a:hlinkClick>`; build the
  `ppaction://` URI for actions; register a slide relationship for `slide` jumps.

## Edge cases

- `action` and `url` are mutually exclusive — warn if both.
- Slide-jump target out of range → warn + skip.
- Default-off preserved; existing click-URL behavior unchanged.

## Test cases

```ts
// hover emits <a:hlinkHover r:id tooltip>
// action:'nextSlide' emits action="ppaction://hlinkshowjump?jump=nextslide"
// action:'slide', slide:5 emits hlinksldjump + a slide rel to slide5
```

## Acceptance

- Schema fixtures validate clean. Matrix §4 rows → `✅ Done`.
- `website/docs/*` documents hover + action links; `CHANGELOG.md` `Added`.
