# Feature: Structured / Talking-Points Notes Export

> **Status:** Implemented
> **Implemented:** `slide.addNotes(string | NoteParagraph[])` — string keeps the original single-paragraph notes-slide body (byte-identical); an array of `{ text, bullet?, indentLevel? }` emits multiple `<a:p>` paragraphs (`<a:buChar char="•"/>` + `lvl`) into the existing `notesSlideN.xml` body placeholder via `buildNotesBodyParagraphs()`. No new ZIP parts/rels/Content_Types.
> **Priority:** Low/Medium — Phase 4 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §2 Slide-level objects — "Talking-points notes export"

## Problem

`slide.addNotes(string)` writes a single plain-text notes slide. There's no way
to author **structured** speaker notes (bulleted talking points, multiple
paragraphs with formatting) — common when generating decks from outlines.

## Proposed API

```ts
// Accept structured notes (array of paragraphs / bullets) in addition to a string
slide.addNotes([
  { text: 'Open with the problem statement', bullet: true },
  { text: 'Mention the 3 key metrics', bullet: true, indentLevel: 1 },
  { text: 'Transition to the demo' },
])
```

Backwards compatible: a plain `string` still works exactly as today.

## What it generates (OOXML)

The notes slide (`/ppt/notesSlides/notesSlideN.xml`) already exists; this enriches
the body placeholder's `<a:txBody>` with multiple `<a:p>` paragraphs, bullet
`<a:buChar>`/`<a:buAutoNum>` and indent levels (`lvl`), instead of a single
run:

```xml
<a:p><a:pPr lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>Open with…</a:t></a:r></a:p>
<a:p><a:pPr lvl="1"><a:buChar char="•"/></a:pPr><a:r><a:t>Mention…</a:t></a:r></a:p>
<a:p><a:r><a:t>Transition…</a:t></a:r></a:p>
```

Reuse the existing paragraph/bullet emit from the text engine.

## Implementation location

- `src/core-interfaces.ts` — widen `addNotes` to accept `string | NoteParagraph[]`.
- `src/gen-objects.ts` (`addNotesDefinition`) + `src/gen-xml.ts` — emit the
  structured body, reusing the text paragraph/bullet builder.

## Edge cases

- Empty array → empty notes body (valid).
- Default-off: string input emits byte-identical XML to today.

## Test cases

```ts
// addNotes([...]) emits multiple <a:p> with bullets + lvl in the notes body
// addNotes("plain") is unchanged (regression)
```

## Acceptance

- Schema fixture validates clean; string-notes regression unchanged.
- Matrix "Talking-points notes export" → `✅ Done`. Docs + `CHANGELOG.md` `Added`.
