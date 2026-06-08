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


```typescript
import pptxgen from "pptxgenjs";

let pres = new pptxgen();
let slide = pptx.addSlide();

slide.addText('Hello World!', { x:1.5, y:1.5, fontSize:18, color:'363636' });

slide.addNotes('This is my favorite slide!');

pptx.writeFile('Sample Speaker Notes');
```
