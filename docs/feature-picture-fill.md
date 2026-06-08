# Feature: Picture / Blip Fill on Shapes (`a:blipFill`)

> **Status:** Proposed
> **Priority:** High — Phase 1 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §3 Fills — "Picture/blip fill (shapes)"

## Problem

Shapes can be filled with a solid color, gradient, or (soon) pattern, but not
with an image. OOXML supports filling any `<p:sp>` with `<a:blipFill>`
(stretch or tile). This is needed for textured backgrounds, logo-filled
shapes, and image masks behind custom geometry.

## Proposed API

```ts
slide.addShape('roundRect', {
  x: 1, y: 1, w: 4, h: 3,
  fill: {
    type: 'image',
    path: './assets/bg.jpg',     // or `data:` base64, like addImage()
    sizing: 'stretch',           // 'stretch' (default) | 'tile'
    transparency?: 20,           // 0–100 (%), optional
  },
})
```

## What it generates (OOXML)

```xml
<!-- stretch -->
<a:blipFill>
  <a:blip r:embed="rId5"/>
  <a:stretch><a:fillRect/></a:stretch>
</a:blipFill>

<!-- tile -->
<a:blipFill>
  <a:blip r:embed="rId5"/>
  <a:tile tx="0" ty="0" sx="100000" sy="100000" algn="tl"/>
</a:blipFill>
```

Filling a shape with an image requires **registering an image relationship** on
the slide (a media part + `_rels` entry + `[Content_Types].xml` override) —
reuse the existing image pipeline so dedup/encoding/rels all work.

## Implementation location

- `src/core-interfaces.ts` — `ImageFillProps { type:'image'; path?; data?; sizing?; transparency? }`
  added to the `ShapeFillProps` union.
- `src/gen-objects.ts` / `src/pptxgen.ts` — when a shape carries an image fill,
  register a media rel (reuse `addImage` rel logic) and thread the `r:embed` id
  into the shape's fill emit.
- `src/gen-xml.ts` — emit `<a:blipFill>` with the resolved `r:embed`.

## Edge cases

- Same image used by multiple shapes → dedupe to one media part (existing logic).
- `transparency` → `<a:alphaModFix amt="...">` inside the blip (thousandths-%).
- Missing both `path` and `data` → warn + fall back to no fill.

## Test cases

```ts
// image fill registers a media rel and emits <a:blipFill>/<a:blip r:embed>
// stretch vs tile produce <a:stretch> vs <a:tile>
// schema fixture validates; Content_Types has the image Default extension
```

## Acceptance

- Schema fixtures for stretch + tile validate clean; media rel + Content_Types
  override confirmed present.
- Matrix "Picture/blip fill (shapes)" → `✅ Done`.
- `website/docs/api-shapes.md` documents image fill with an example.
- `CHANGELOG.md` `Added` entry.
