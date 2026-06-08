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


```typescript
import pptxgen from "pptxgenjs";

let pres = new pptxgen();
let slide = pptx.addSlide();

slide.addText('Hello World!', { x:1.5, y:1.5, fontSize:18, color:'363636' });

slide.addNotes('This is my favorite slide!');

pptx.writeFile('Sample Speaker Notes');
```
