# PptxGenJS — Fork Notes

> **This is a fork of [gitbrent/PptxGenJS](https://github.com/gitbrent/PptxGenJS)
> (v4.0.1)** with native support for slide transitions, entrance animations,
> gradient fills, and 20+ OOXML correctness fixes.

## Why this fork exists

The upstream library is excellent for general-purpose PPTX generation, but lacks
several features needed for automated HTML-to-PPTX conversion pipelines (dark-themed
presentation decks with animations, sequential build steps, gradient accents).

Previously, these were bolted on with a brittle post-processing step that unzipped
the `.pptx`, string-edited the XML, and re-zipped. This fork moves those
capabilities into the library as first-class, schema-validated APIs.

---

## What's different from upstream

### New Features (not in upstream)

| Feature | API | Status |
|---------|-----|--------|
| **Slide transitions** | `slide.transition = { type, duration?, direction? }` | ✅ Done |
| **Shape entrance animations** | `animation: { type, duration?, delay?, trigger?, direction? }` | ✅ Done (appear, fadeIn, flyIn, zoomIn) |
| **Shape emphasis animations** | `animation: { type: 'pulse' \| 'spin' \| 'grow' \| 'colorPulse', spinDegrees?, growScale?, color? }` | ✅ Done |
| **Shape exit animations** | `animation: { type: 'disappear' \| 'fadeOut' \| 'flyOut' \| 'zoomOut', duration?, direction? }` | ✅ Done |
| **Animation build steps** | `trigger: 'afterPrevious' \| 'withPrevious' \| 'onClick'` | ✅ Done |
| **Counter (odometer) sugar** | `counter: { from, to, suffix?, stepMs? }` on `addText()` | ✅ Done |
| **Header/footer (master config)** | `defineSlideMaster({ headerFooter: { slideNumber?, dateTime?, footer? } })` | ✅ Done (master/layout `<p:hf>` + footer/date placeholders) |
| **Gradient fills** | `fill: { type: 'gradient', stops[], direction? }` | ✅ Done |

### Bug Fixes (not yet in upstream)

20 OOXML correctness bugs fixed — all producing "needs repair" dialogs or
corrupt output in upstream. Key fixes:

- **Duplicate `<a:pPr>` per paragraph** — triggered repair dialog
- **Missing `<p:txBody>`** on textless shapes — triggered repair dialog
- **Missing `<a:effectLst/>`** on solid backgrounds — triggered repair dialog
- **`writeFile()` mutation** — calling write twice produced invalid EMU values
- **8-char hex (RGBA) color corruption** — silently produced invalid XML
- **Combo chart axis ID mismatches** — dangling references
- **`<p:presentation>` child ordering** — violated ECMA-376 sequence

Full list with commit SHAs: see `.autoloop/bug-report.md`

### Critical architecture fix: `genXmlTiming`

The timing XML generator was completely rewritten. The original wrapped all
animated effects in a single parallel container, making `afterPrevious` triggers
meaningless (everything fired at once). The rewrite emits proper sequential
build steps under `<p:seq nodeType="mainSeq">`.

---

## Installation

```bash
# Clone this fork
git clone https://github.com/jsamuel1/PptxGenJS.git
cd PptxGenJS

# Install & build
npm install
npm run build

# Run tests (includes OOXML schema validation)
npm test
```

### Use in a project

```bash
# Point to the fork in package.json
"pptxgenjs": "github:jsamuel1/PptxGenJS"
```

Or reference the built dist directly:
```js
const pptxgen = require('./path/to/PptxGenJS/dist/pptxgen.cjs.js')
```

---

## Quick examples

### Slide transition

```ts
const slide = pptx.addSlide()
slide.transition = { type: 'fade', duration: 500 }
```

### Animated text (sequential build)

```ts
slide.addText('Title', {
  x: 1, y: 1, w: 8, h: 1,
  fontSize: 28,
  animation: { type: 'fadeIn', duration: 400, trigger: 'afterPrevious' }
})
slide.addText('Subtitle', {
  x: 1, y: 2, w: 8, h: 0.5,
  fontSize: 18,
  animation: { type: 'fadeIn', duration: 400, trigger: 'withPrevious' }
})
// ^ Title and subtitle fade in together (same build step)

slide.addText('Body text', {
  x: 1, y: 3, w: 8, h: 2,
  animation: { type: 'appear', trigger: 'afterPrevious' }
})
// ^ Appears AFTER the title+subtitle step completes
```

### Emphasis animations

Emphasis effects draw attention to an **already-visible** object (no entrance
"reveal" — they animate in place):

```ts
slide.addText('Important', {
  x: 1, y: 1, w: 4, h: 1,
  animation: { type: 'spin', spinDegrees: 720 }   // rotate 720°
})
slide.addShape('rect', {
  x: 1, y: 3, w: 2, h: 1, fill: { color: 'FF0000' },
  animation: { type: 'grow', growScale: 2 }        // scale to 200%
})
slide.addText('Flash', {
  x: 4, y: 1, w: 4, h: 1,
  animation: { type: 'colorPulse', color: 'FF00FF' } // tint to magenta
})
slide.addText('Pulse', {
  x: 4, y: 3, w: 4, h: 1,
  animation: { type: 'pulse' }                     // opacity dip + recover
})
// Emphasis types: 'pulse' | 'spin' | 'grow' | 'colorPulse'
// (emit presetClass="emph"; share the same trigger/group/stagger semantics)
```

### Exit animations

Exit effects are the counterpart to entrance effects — they make an
**already-visible** object leave (no leading "reveal" `<p:set>`):

```ts
slide.addText('Goodbye', {
  x: 1, y: 1, w: 4, h: 1,
  animation: { type: 'fadeOut', duration: 600 }        // fade away
})
slide.addShape('rect', {
  x: 1, y: 3, w: 2, h: 1, fill: { color: '00FF00' },
  animation: { type: 'flyOut', direction: 'right' }    // slide off to the right
})
slide.addShape('rect', {
  x: 4, y: 3, w: 2, h: 1, fill: { color: '0000FF' },
  animation: { type: 'zoomOut' }                       // shrink to nothing
})
slide.addText('Gone', {
  x: 4, y: 1, w: 4, h: 1,
  animation: { type: 'disappear' }                     // instant hide
})
// Exit types: 'disappear' | 'fadeOut' | 'flyOut' | 'zoomOut'
// (emit presetClass="exit"; share the same trigger/group/stagger semantics)
```

### Header / footer (slide master config)

Configure a footer, date, and slide-number on a slide master. This emits a
derived `<p:hf>` plus the matching footer/date placeholders on the master's
layout (the master's own hardcoded `<p:hf>` is left untouched):

```ts
pptx.defineSlideMaster({
  title: 'CORPORATE',
  headerFooter: {
    slideNumber: true,                  // <p:hf sldNum="1">
    dateTime: { format: 'datetime1' },  // <p:hf dt="1"> + auto-updating date field
    // dateTime: { value: 'Q1 2026' },  // ...or literal static text instead
    footer: 'Confidential',             // <p:hf ftr="1"> + footer placeholder text
  },
})
pptx.addSlide({ masterName: 'CORPORATE' })
// NOTE: per-slide show/hide and notes/handout headers are not yet supported
// (`<p:hf>` is not valid on a slide — that's a separate placeholder mechanism).
```

### Gradient fill

```ts
slide.addShape('rect', {
  x: 0, y: 0, w: '100%', h: '100%',
  fill: {
    type: 'gradient',
    stops: [
      { position: 0, color: '121218' },
      { position: 100, color: '1a1a24' }
    ],
    direction: 90
  }
})
```

### Counter (odometer)

```ts
slide.addText('', {
  x: 2, y: 2, w: 4, h: 1.5,
  counter: { from: 1, to: 7, suffix: '×', stepMs: 180 }
})
// Produces: 1× → 2× → 3× → ... → 7× with 180ms between each
```

---

## Documentation

| Document | Purpose |
|----------|---------|
| `PROMPT.md` | Full feature spec with OOXML examples, proposed APIs, and priority roadmap |
| `CHANGELOG.md` | All changes in Keep a Changelog format |
| `.autoloop/bug-report.md` | Bug fix traceability (commit SHAs, repro steps) |
| `README.md` | Original upstream readme (unchanged) |

---

## Roadmap (proposed, not yet implemented)

See `PROMPT.md` for full specs. Priority order:

1. `flyIn` animation (directional translate — OOXML spec ready)
2. Auto-fit text shrink on overflow (`<a:normAutofit>`)
3. Multi-column text (`numCol` attribute — very low effort)
4. Shape grouping (`<p:grpSp>` with relative child coordinates)
5. Callout/badge sugar (convenience wrapper for `roundRect` + centered text)
6. Shadow & glow effects (`<a:effectLst>`)
7. SVG-to-shape conversion (custom geometry paths — v2)

---

## Relationship to upstream

This fork does **not** submit PRs to upstream. It is maintained independently for
use in automated presentation pipelines. If upstream adopts equivalent features,
we will evaluate merging back.

Upstream version at fork point: **v4.0.1** (2025-06-25).

---

## License

Same as upstream: [MIT](LICENSE)
