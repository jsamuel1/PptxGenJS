---
id: sections
title: Slide Sections
---

Group slides using sections.

## Syntax

```typescript
pptx.addSection({ title: "Tables" });
pptx.addSection({ title: "Tables", order: 3 });
```

## Section Options

| Option  | Type    | Description   | Possible Values                                                             |
| :------ | :------ | :------------ | :-------------------------------------------------------------------------- |
| `title` | string  | section title | 0-n OR 'n%'. (Ex: `{x:'50%'}` will place object in the middle of the Slide) |
| `order` | integer | section order | 1-n. Used to add section at any index                                       |

## Section Example

```typescript
import pptxgen from "pptxgenjs";
let pptx = new pptxgen();

// STEP 1: Create a section
pptx.addSection({ title: "Tables" });

// STEP 2: Provide section title to a slide that you want in corresponding section
let slide = pptx.addSlide({ sectionTitle: "Tables" });

slide.addText("This slide is in the Tables section!", { x: 1.5, y: 1.5, fontSize: 18, color: "363636" });
pptx.writeFile({ fileName: "Section Sample.pptx" });
```

## Custom Shows

Define named, ordered subsets of slides ("custom shows") that PowerPoint can present independently — for example a short executive version and a full version of the same deck. Custom shows reference slides you have already added; they do not duplicate them.

### Syntax

```typescript
pptx.addCustomShow({ name: "Exec Summary", slides: [slide1, slide3] });
```

### Custom Show Options

| Option   | Type          | Description                          | Possible Values                          |
| :------- | :------------ | :----------------------------------- | :--------------------------------------- |
| `name`   | string        | custom show display name             | any string (XML-escaped automatically)   |
| `slides` | PresSlide\[\] | slides included, in show order       | slide objects returned by `addSlide()`   |

### Custom Show Example

```typescript
import pptxgen from "pptxgenjs";
let pptx = new pptxgen();

let slide1 = pptx.addSlide(); slide1.addText("Overview", { x: 1, y: 1, fontSize: 24 });
let slide2 = pptx.addSlide(); slide2.addText("Details", { x: 1, y: 1, fontSize: 24 });
let slide3 = pptx.addSlide(); slide3.addText("Summary", { x: 1, y: 1, fontSize: 24 });

// A short show that skips the details slide
pptx.addCustomShow({ name: "Exec Summary", slides: [slide1, slide3] });

pptx.writeFile({ fileName: "Custom Show Sample.pptx" });
```
