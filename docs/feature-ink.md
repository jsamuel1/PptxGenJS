# Feature: Ink Annotations (`p:contentPart` + InkML)

> **Status:** Proposed
> **Priority:** Low (niche, but tractable) — Phase 4 (matrix `❌ Missing (niche)` → `✅`)
> **Matrix row:** §2 Slide-level objects — "Ink"

## Problem

No support for ink (stylus/handwriting) annotations. Niche for code-generated
decks, but technically straightforward: a slide references an InkML part via a
`<p:contentPart>` + relationship, and InkML is plain XML (trace point lists).

## Proposed API

```ts
slide.addInk({
  // each stroke is an array of [x, y] points in EMU (or inches → converted)
  strokes: [
    [[1, 1], [1.2, 0.9], [1.5, 1.1]],
    [[2, 2], [2.3, 2.1]],
  ],
  color?: '7C3AED',
  width?: 2,   // pt
})
```

## What it generates (OOXML)

```
/ppt/ink/ink1.xml            <inkml:ink>…<inkml:trace>…points…</inkml:trace></inkml:ink>
/ppt/slides/slideN.xml:
  <mc:AlternateContent>
    <mc:Choice Requires="a14">
      <p:contentPart r:id="rId6"/>
    </mc:Choice>
    <mc:Fallback>…optional rasterized fallback…</mc:Fallback>
  </mc:AlternateContent>
```

plus the slide rel (`.../customXml`-style ink relationship) and Content_Types
override. (Ink is wrapped in `mc:AlternateContent` so non-supporting viewers
degrade gracefully.)

## Implementation location

- `src/core-interfaces.ts` — `InkProps`.
- `src/gen-objects.ts` / `src/pptxgen.ts` — register the InkML part + rel +
  Content_Types.
- `src/gen-xml.ts` — emit the `<p:contentPart>` (inside `mc:AlternateContent`)
  and the InkML trace XML from the stroke points.

## Edge cases

- Convert inches → EMU for points if inputs are in inches; document the unit.
- Default-off preserved. **Copy fidelity:** when copying a slide, the ink part +
  rel must be carried verbatim (this is the primary real-world use — preserving
  ink on round-trip, even more than authoring it).

## Test cases

```ts
// addInk packages /ppt/ink/inkN.xml + rel + Content_Types, and emits
// <p:contentPart> inside <mc:AlternateContent>; traces match the stroke points
```

## Acceptance

- Schema fixture validates clean. Matrix "Ink" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
