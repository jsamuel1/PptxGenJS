---
id: speaker-notes
title: Speaker Notes
---

Speaker Notes can be included on any Slide.

## Syntax

```typescript
slide.addNotes('TEXT');
```

## Example: JavaScript

```typescript
let pres = new PptxGenJS();
let slide = pptx.addSlide();

slide.addText('Hello World!', { x:1.5, y:1.5, fontSize:18, color:'363636' });

slide.addNotes('This is my favorite slide!');

pptx.writeFile('Sample Speaker Notes');
```

## Structured / Talking-Points Notes

Pass an array of paragraph objects to `addNotes()` to author structured speaker
notes — multiple paragraphs with optional bullets and indent levels. Passing a
plain string keeps the original single-paragraph behavior.

| Option        | Type      | Default | Description                                              |
| :------------ | :-------- | :------ | :------------------------------------------------------- |
| `text`        | `string`  |         | Paragraph text (required)                                |
| `bullet`      | `boolean` | `false` | Render the paragraph as a bullet (`•`)                   |
| `indentLevel` | `number`  | `0`     | 0-based indent level (maps to the OOXML `lvl` attribute) |

```typescript
slide.addNotes([
  { text: 'Open with the problem', bullet: true },
  { text: 'Mention the 3 key metrics', bullet: true, indentLevel: 1 },
  { text: 'Transition to the demo' },
]);
```

## Review Comments

Add reviewer/QA comments to a Slide with `addComment()`. Authors are deduplicated
into a shared author list, so multiple comments by the same person reuse one author
entry. Comments are emitted in the classic `p:cm` form (widely supported).

| Option   | Type            | Default | Description                                       |
| :------- | :-------------- | :------ | :------------------------------------------------ |
| `author` | `string`        |         | Author display name (required)                    |
| `text`   | `string`        |         | Comment body text (required)                      |
| `x`      | `number`        | `0.5`   | Anchor X position (inches)                        |
| `y`      | `number`        | `0.5`   | Anchor Y position (inches)                        |
| `date`   | `Date | string` | now     | Comment timestamp (`Date` or ISO-8601 string)     |

```typescript
let slide = pptx.addSlide();
slide.addComment({ author: 'Reviewer', text: 'Confirm the Q3 number', x: 1, y: 1 });
slide.addComment({ author: 'Reviewer', text: 'Add a source footnote' });
```

## Ink Annotations

Add stylus/handwriting ink to a Slide with `addInk()`. Each call writes an InkML
part (`ppt/ink/ink-{N}-{i}.xml`) referenced from the slide via a `<p:contentPart>`,
so multiple ink annotations can coexist on one slide. Strokes are arrays of `[x, y]`
points in **inches** (converted to EMU on export).

| Option    | Type             | Default    | Description                                            |
| :-------- | :--------------- | :--------- | :----------------------------------------------------- |
| `strokes` | `number[][][]`   |            | Strokes, each an array of `[x, y]` points (inches)     |
| `color`   | `string`         | `'000000'` | Stroke color (6-digit hex, no `#`)                     |
| `width`   | `number`         | `1`        | Stroke width (points)                                  |

```typescript
let slide = pptx.addSlide();
slide.addInk({
  strokes: [
    [[1, 1], [1.2, 0.9], [1.5, 1.1]],
    [[2, 2], [2.3, 2.1]],
  ],
  color: '7C3AED',
  width: 2,
});
```

## SmartArt Diagrams

Add a SmartArt diagram from a flat list of strings with `addSmartArt()`. The
minimal supported set is a **process** (left-to-right) or **list** (top-to-bottom)
diagram. Each call packages the five linked `/ppt/diagrams/*` parts plus a
`<p:graphicFrame>`, and includes a precomputed drawing cache so the diagram
renders without PowerPoint recomputing the layout.

| Option   | Type                     | Default    | Description                                  |
| :------- | :----------------------- | :--------- | :------------------------------------------- |
| `layout` | `'list'` \| `'process'`  |            | Diagram layout (vertical list / horizontal)  |
| `items`  | `string[]`               |            | One node per string                          |
| `x`      | `number`                 | `1`        | Horizontal position (inches)                 |
| `y`      | `number`                 | `1`        | Vertical position (inches)                   |
| `w`      | `number`                 | `8`        | Width (inches)                               |
| `h`      | `number`                 | `3`        | Height (inches)                              |
| `color`  | `string`                 | `'4472C4'` | Node fill color (6-digit hex, no `#`)        |

```typescript
let slide = pptx.addSlide();
slide.addSmartArt({
  x: 1, y: 1, w: 10, h: 3,
  layout: 'process',
  items: ['Discover', 'Build', 'Ship'],
  color: '7C3AED',
});
```


```typescript
import pptxgen from "pptxgenjs";

let pres = new pptxgen();
let slide = pptx.addSlide();

slide.addText('Hello World!', { x:1.5, y:1.5, fontSize:18, color:'363636' });

slide.addNotes('This is my favorite slide!');

pptx.writeFile('Sample Speaker Notes');
```
