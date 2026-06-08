# Feature: Photo Album (`p:photoAlbum`)

> **Status:** Proposed
> **Priority:** Low — Phase 4 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §1 Presentation container — "Photo album"

## Problem

No support for marking a deck as a PowerPoint "photo album" (the metadata that
drives the album layout/frame styling UI).

## Proposed API

```ts
pptx.photoAlbum = {
  blackWhite?: false,
  showCaptions?: true,
  layout?: '1pic' | '2pic' | '4pic' | 'fitToSlide',
  frame?: 'frameStyle1' | 'frameStyle2' | … ,
}
```

(A higher-level "build an album from an array of images" helper can be layered
on later; this feature is the underlying `<p:photoAlbum>` metadata.)

## What it generates (OOXML)

In `presentation.xml`:

```xml
<p:photoAlbum bw="0" showCaptions="1" layout="fitToSlide" frame="frameStyle1"/>
```

Positioned per `CT_Presentation` child order.

## Implementation location

- `src/core-interfaces.ts` — `PhotoAlbumProps`.
- `src/gen-xml.ts` — emit `<p:photoAlbum>` when set.

## Edge cases

- It's metadata only — actual image slides are still authored normally.
- Default-off preserved.

## Test cases

```ts
// pptx.photoAlbum = {...} emits <p:photoAlbum ...> with mapped attributes
```

## Acceptance

- Schema fixture validates clean. Matrix "Photo album" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
