# Feature: SmartArt / Diagrams (`dgm:*`, `dsp:*`)

> **Status:** Implemented (minimal `list` / `process` subset)
> **Priority:** Low (large) — Phase 4 (matrix `❌ Missing` → `✅`); scope a minimal subset first
> **Matrix row:** §2 Slide-level objects — "SmartArt / diagrams"

## Problem

No support for SmartArt diagrams. SmartArt is the most complex slide object in
OOXML — a `<p:graphicFrame>` referencing **four** linked parts (data, layout,
style, colors) under `/ppt/diagrams/`, plus a drawing-cache (`dsp:`) so it
renders without PowerPoint recomputing the layout.

## Scope guidance (do the minimal subset first)

Do **not** attempt full SmartArt authoring. Start with **one** common layout —
a simple **list** or **process** (horizontal/vertical bulleted steps) — driven
from a flat array of strings. Generate the data part + a precomputed drawing
cache so it renders. Expand layouts only if there is demand.

## Proposed API (minimal)

```ts
slide.addSmartArt({
  x: 1, y: 1, w: 10, h: 3,
  layout: 'process',            // initial supported set: 'list' | 'process'
  items: ['Discover', 'Build', 'Ship'],
  color?: 'accent1',
})
```

## What it generates (OOXML)

```
/ppt/diagrams/data1.xml      <dgm:dataModel> (the point/connection model)
/ppt/diagrams/layout1.xml    <dgm:layoutDef>
/ppt/diagrams/quickStyle1.xml<dgm:styleDef>
/ppt/diagrams/colors1.xml    <dgm:colorsDef>
/ppt/diagrams/drawing1.xml   <dsp:drawing> (drawing cache so it renders)
/ppt/slides/slideN.xml:
  <p:graphicFrame>…<a:graphic><a:graphicData uri=".../diagram">
    <dgm:relIds r:dm="rId.." r:lo="rId.." r:qs="rId.." r:cs="rId.."/>
  </a:graphicData></a:graphic></p:graphicFrame>
```

plus the slide rels (4 diagram parts + the drawing) and Content_Types overrides.

## Implementation location

- `src/core-interfaces.ts` — `SmartArtProps`.
- `src/gen-objects.ts` / `src/pptxgen.ts` — register the 4+1 diagram parts,
  rels, Content_Types.
- New `src/gen-smartart.ts` — emit the `dgm:`/`dsp:` XML for the supported
  layouts (templated; fill the data model + drawing cache from `items`).

## Edge cases

- Drawing cache must position items consistently with the layout, or PowerPoint
  re-lays-out (acceptable) — but emit a valid cache so it renders out of the box.
- Default-off preserved. Copy fidelity: carry all 5 parts + rels verbatim.

## Test cases

```ts
// addSmartArt('process', items) creates data/layout/style/colors/drawing parts,
// the graphicFrame with <dgm:relIds>, slide rels, and Content_Types overrides;
// all parts schema-validate.
```

## Acceptance

- Schema fixtures validate clean for the supported layout(s).
- Matrix "SmartArt / diagrams" → `✅ Done` (note: minimal subset).
- Docs + `CHANGELOG.md` `Added`.

## Implementation notes (as shipped)

- `slide.addSmartArt({ x, y, w, h, layout: 'list' | 'process', items, color? })`. Empty/invalid
  `items` or an unknown `layout` is a no-op (default-off — no parts/rels/overrides/graphicFrame).
- Five parts per diagram: `ppt/diagrams/{data,layout,quickStyle,colors,drawing}{slideNum}-{idx}.xml`.
  Filenames are deck-deterministic (slide number + per-slide index), so multiple diagrams never collide.
- **Relationships:** all FIVE are slide relationships. The four standard diagram parts use the
  `officeDocument/2006/relationships/diagram{Data,Layout,QuickStyle,Colors}` Types and are referenced
  by the graphicFrame's `<dgm:relIds r:dm r:lo r:qs r:cs>`. The drawing cache uses the Microsoft
  extension Type `office/2007/relationships/diagramDrawing` and is referenced from the data model's
  `extLst` via `<dsp:dataModelExt relId="rId..">` — pointing at that fifth slide relationship.
  (The Open XML SDK rejects the drawing relationship when placed on the data part, so it lives on the
  slide.) This is a cross-entity id invariant ×5: all five rIds are distinct and resolve.
- **Layout/style/colors** parts are emitted minimal-but-schema-valid; the precomputed `<dsp:drawing>`
  cache (one `<dsp:sp>` per item, laid out along a row for `process` / a column for `list`) is what
  makes the diagram render out-of-the-box without PowerPoint recomputing the layout.
- Dependency-free — no new runtime dependency. Validated clean by the OOXML schema fixture
  (`test/schema.test.js`) + unit tests (`test/feature-smartart.test.js`).
