# Feature: Custom Shows (`p:custShowLst`)

> **Status:** Proposed
> **Priority:** Low — Phase 4 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §1 Presentation container — "Custom shows"

## Problem

No support for "custom shows" — named, ordered subsets of slides that can be
presented independently (e.g. a short vs. full version of the same deck).

## Proposed API

```ts
// Reference slides by their handle/index
const s1 = pptx.addSlide(); const s2 = pptx.addSlide(); const s3 = pptx.addSlide()
pptx.addCustomShow({ name: 'Exec Summary', slides: [s1, s3] })
```

## What it generates (OOXML)

In `presentation.xml`, after the main slide list:

```xml
<p:custShowLst>
  <p:custShow name="Exec Summary" id="0">
    <p:sldLst>
      <p:sld r:id="rId2"/>   <!-- rels to the included slides -->
      <p:sld r:id="rId4"/>
    </p:sldLst>
  </p:custShow>
</p:custShowLst>
```

Each `<p:sld>` references a slide via a relationship id (the same rels used by
`<p:sldIdLst>`). `custShowLst` sits in its valid `CT_Presentation` position.

## Implementation location

- `src/core-interfaces.ts` — `CustomShowProps`; store shows on the presentation.
- `src/gen-xml.ts` — emit `<p:custShowLst>` in canonical child order, mapping
  slide handles → their relationship ids.

## Edge cases

- A slide can appear in multiple shows / multiple times in one show.
- Empty `slides` → warn + skip.
- Default-off preserved.

## Test cases

```ts
// addCustomShow emits <p:custShowLst><p:custShow name id><p:sldLst><p:sld r:id>
// slide r:id values match the sldIdLst rels
```

## Acceptance

- Schema fixture validates clean. Matrix "Custom shows" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
