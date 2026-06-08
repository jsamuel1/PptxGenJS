# Feature: Hover Hyperlinks & Action Jumps (`a:hlinkHover`, `a:hlinkClick action=`)

> **Status:** Proposed
> **Priority:** Medium — Phase 3 (matrix `❌ Missing` → `✅`)
> **Matrix rows:** §4 Hyperlinks & actions — "Hover hyperlink", "Action jumps"

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
