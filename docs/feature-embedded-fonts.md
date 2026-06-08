# Feature: Embedded Fonts (`p:embeddedFontLst` + `/ppt/fonts/*`)

> **Status:** Proposed
> **Priority:** High — Phase 4 (matrix `❌ Missing` → `✅`); high value for portable decks
> **Matrix row:** §1 Presentation container — "Embedded fonts"

## Problem

Decks that use non-system fonts render with substitutes on machines lacking the
font. OOXML supports embedding font files in the package so the deck is
portable. (The README markets "Asian fonts" but no embedding exists today.)

## Proposed API

```ts
pptx.embedFont({
  family: 'Inter',
  regular: './fonts/Inter-Regular.ttf',   // path or data
  bold?: './fonts/Inter-Bold.ttf',
  italic?: './fonts/Inter-Italic.ttf',
  boldItalic?: './fonts/Inter-BoldItalic.ttf',
})
```

## What it generates (OOXML)

```
/ppt/fonts/font1.fntdata …                      (the font binary parts)
/ppt/presentation.xml:
  <p:embeddedFontLst>
    <p:embeddedFont>
      <p:font typeface="Inter"/>
      <p:regular r:id="rId10"/><p:bold r:id="rId11"/>…
    </p:embeddedFont>
  </p:embeddedFontLst>
```

plus `presentation.xml.rels` entries (relationship type
`.../font`) and `[Content_Types].xml` `Default Extension="fntdata"`. Set
`<p:presentation embedTrueTypeFonts="1" .../>` and respect the
`embeddedFontLst` position in `CT_Presentation` child order (after
`handoutMasterIdLst`/`sldIdLst`/`sldSz`/`notesSz`).

## Implementation location

- `src/core-interfaces.ts` — `EmbedFontProps`; store embedded fonts on the
  presentation.
- `src/pptxgen.ts` — package the font binary parts, rels, Content_Types; set
  the `embedTrueTypeFonts` attribute.
- `src/gen-xml.ts` — emit `<p:embeddedFontLst>` in the correct
  `CT_Presentation` position (mind the B20 ordering fix).

## Edge cases

- Only TrueType/OpenType (`.ttf`/`.otf`) — validate; warn on others.
- Subsetting is out of scope (embed full font); document the size implication.
- Default-off: no font parts / no `embeddedFontLst` when none embedded.
- Copy fidelity: preserve font parts + rels when copying.

## Test cases

```ts
// embedFont packages /ppt/fonts/fontN.fntdata + rels + Content_Types,
// emits <p:embeddedFontLst> in canonical CT_Presentation order,
// and sets embedTrueTypeFonts="1"
```

## Acceptance

- Schema fixture validates clean; presentation child order still valid.
- Matrix "Embedded fonts" → `✅ Done`. Docs + `CHANGELOG.md` `Added`.
