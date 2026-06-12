# Feature: Slide Comments (`p:cm`, `cmAuthorLst`)

> **Status:** Implemented (legacy `p:cm` + `commentAuthors.xml` form). Modern threaded comments (`p188`/`pc`) remain a follow-up.
> **Priority:** Medium — Phase 4 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §2 Slide-level objects — "Comments (modern)"

## Problem

No way to author review comments. Useful for generated decks that need
reviewer notes, automated QA annotations, or threaded feedback.

## Proposed API

```ts
const slide = pptx.addSlide()
slide.addComment({
  author: 'Reviewer',          // resolved/created in the author list
  text: 'Confirm the Q3 number',
  x?: 1, y?: 1,                // anchor (inches); default top-left
  date?: new Date(),
})
```

## What it generates (OOXML)

Modern comments use a comment authors part + per-slide comment parts:

```
/ppt/commentAuthors.xml        <p:cmAuthorLst><p:cmAuthor id="0" name="Reviewer" .../></p:cmAuthorLst>
/ppt/comments/comment1.xml     <p:cmLst><p:cm authorId="0" dt="..."><p:pos x=".." y=".."/><p:text>…</p:text></p:cm></p:cmLst>
```

plus the relationships (`slideN.xml.rels` → comment part) and
`[Content_Types].xml` overrides.

> Note: PowerPoint has both legacy (`p:cm`) and modern (`p188`/`pc`) comment
> schemas. Start with the classic `p:cm` + `commentAuthors.xml` form (simplest,
> widely supported); modern threaded comments can be a follow-up.

## Implementation location

- `src/core-interfaces.ts` — `CommentProps`; comment storage on `PresSlide`.
- `src/pptxgen.ts` — manage the shared `commentAuthors.xml` part + per-slide
  comment parts, rels, and Content_Types overrides.
- `src/gen-xml.ts` — emit the comment XML parts.

## Edge cases

- Dedupe authors into one `commentAuthors.xml` (assign stable `id`s).
- Default-off: no comment parts emitted when no slide has comments.
- Copy fidelity: when copying a slide, carry comment parts + rels verbatim.

## Test cases

```ts
// addComment creates commentAuthors.xml + comments/commentN.xml + rels + Content_Types
// two comments by the same author share one cmAuthor id
```

## Acceptance

- Schema fixture validates clean (all new parts). Matrix "Comments" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
