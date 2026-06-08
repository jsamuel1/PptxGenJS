# Feature: addCallout() v2 — Attribution, Accent Bar, Rich Text

> **Status:** Proposed (extends the implemented `addCallout()`)
> **Target:** `src/gen-objects.ts` (`addCalloutDefinition`), `src/core-interfaces.ts` (`CalloutProps`), tests `test/feature-callout.test.js`
> **Priority:** Medium — quote/callout blocks currently force manual composition

## Problem

`addCallout()` v1 renders a single centred text run inside a rounded rectangle. It
cannot express the common quote/callout block:

- **left-aligned** body with a left accent bar (blockquote motif)
- an **attribution line** (smaller, muted, below the quote)
- **italic** styling, or a specific **font face**
- **multi-run** text (e.g. a bold keyword + normal continuation)
- controllable **inner padding**

So converters bypass `addCallout()` and hand-compose a group (background + accent
rect + body text + attribution text).

## Proposed API additions

```ts
export interface CalloutProps extends PositionProps, ObjectNameProps {
  text: string | TextProps[]             // ENHANCED: accept a multi-run array
  attribution?: string                   // NEW: source/attribution line below the body
  fill?: ShapeFillProps | GradientFillProps | PatternFillProps | ImageFillProps | HexColor
  fontColor?: HexColor
  fontSize?: number
  fontFace?: string                      // NEW
  fontBold?: boolean
  fontItalic?: boolean                   // NEW
  cornerRadius?: number
  align?: HAlign                         // existing; 'left' now lays out correctly
  valign?: VAlign
  accentBar?: {                          // NEW: left-edge vertical bar
    color?: HexColor | GradientFillProps
    width?: number                       // inches, default 0.03
  }
  attributionFont?: { size?: number, color?: HexColor, italic?: boolean }  // NEW
  padding?: number | { l?: number, r?: number, t?: number, b?: number }    // NEW
}
```

## Behaviour

- **When `accentBar` (or `attribution`) is present**, the callout becomes a group:
  1. background `roundRect` (`fill`, `cornerRadius`)
  2. accent bar `rect` at the left edge (`accentBar.width` × full height; solid or gradient)
  3. body text box, inset by `accentBar.width + padding.l`, honouring `align`,
     `fontItalic`, `fontFace`, and `text` as a string or `TextProps[]`
  4. attribution text box below the body (smaller/muted per `attributionFont`)
- **When neither is present**, behaviour is **byte-identical to v1** (a single
  rounded rect with centred text) — fully backwards-compatible.
- `padding` controls the inner inset (single number = all sides, or per-side object).

## What it generates (accent bar + attribution)

```
┌─┬──────────────────────────────────────────┐
│▌│ "The dispatcher is the game changer — it  │  body (italic, left)
│▌│  turns Quick into an operating system."   │
│▌│                                            │
│▌│ — Internal power-user feedback             │  attribution (smaller, muted)
└─┴──────────────────────────────────────────┘
```

## Implementation location

- `src/core-interfaces.ts` → extend `CalloutProps` (union `text`, `attribution`,
  `fontFace`, `fontItalic`, `accentBar`, `attributionFont`, `padding`)
- `src/gen-objects.ts` → in `addCalloutDefinition`: keep the v1 single-rect path when
  no accent/attribution; otherwise compose a group (reuses `addGroup`/`addShape`/`addText`)

## Test cases

```ts
// v1 compatibility: no accentBar/attribution -> single roundRect, centred text (unchanged)
slide.addCallout({ x:1, y:5, w:8, h:1, text:'Hello', fill:'1E1A2B' })

// Quote block: accent bar + italic body + attribution
slide.addCallout({
  x:1, y:5, w:8, h:1.2,
  text: 'The dispatcher is the game changer — it turns Quick from a chatbot into an operating system.',
  attribution: '— Internal power user feedback',
  fill: '1E1A2B', fontColor: 'D4D0DE', fontItalic: true, fontSize: 12, align: 'left',
  accentBar: { color: '7C3AED', width: 0.04 },
  attributionFont: { size: 9, color: '64748B' },
  padding: { l: 0.25, r: 0.2, t: 0.15, b: 0.15 },
})
// Expected: group = bg roundRect + left accent rect + italic body + muted attribution line

// Multi-run text
slide.addCallout({ x:1, y:5, w:8, h:1,
  text: [ { text:'Tip: ', options:{ bold:true, color:'A78BFA' } }, { text:'pin critical chats.', options:{} } ],
  accentBar: { color:'7C3AED' } })
```

## Impact on converter

Lets the converter render quote/callout blocks (e.g. slide 3's italic quote, the
bottom "POWER TIP" callout) via one native `addCallout({ accentBar, attribution })`
call instead of the current manual group (bg rect + accent rect + italic text +
attribution), removing ~15–20 lines and the duplicated layout logic.
