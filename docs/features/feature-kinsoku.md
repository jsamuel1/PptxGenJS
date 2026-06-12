# Feature: Kinsoku — East-Asian Line-Break Rules (`p:kinsoku`)

> **Status:** Implemented
> **Priority:** Low — Phase 4 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §1 Presentation container — "Kinsoku (E-Asian breaks)"
>
> **Implemented:** `pptx.kinsoku = { lang?, invalStChars?, invalEndChars? }` →
> `<p:kinsoku>` emitted in `presentation.xml` between `<p:notesSz>` and
> `<p:defaultTextStyle>` (canonical `CT_Presentation` order). ja-JP defaults,
> attribute values XML-escaped via `encodeXmlEntities`, default-off byte-identical.
> Touch points: `src/core-interfaces.ts` (`KinsokuProps` + `kinsoku?` on
> `PresentationProps`), `src/pptxgen.ts` (`pptx.kinsoku` accessor),
> `src/gen-xml.ts` (`makeXmlPresentation` emit). Schema fixture `kinsoku`.

## Problem

No support for kinsoku line-breaking rules (the characters that may not start
or end a line in CJK typography). Relevant given the library markets Asian-font
support.

## Proposed API

```ts
pptx.kinsoku = {
  lang?: 'ja-JP',
  // characters not allowed to start a line:
  invalStChars?: '!),.:;?]}…',
  // characters not allowed to end a line:
  invalEndChars?: '([{‘“',
}
```

Sensible per-language defaults should be provided so most users just set
`lang`.

## What it generates (OOXML)

In `presentation.xml`:

```xml
<p:kinsoku lang="ja-JP" invalStChars="!),.:;?]}…" invalEndChars="([{‘“"/>
```

Positioned per `CT_Presentation` child order.

## Implementation location

- `src/core-interfaces.ts` — `KinsokuProps`.
- `src/gen-xml.ts` — emit `<p:kinsoku>` when set, in canonical position.

## Edge cases

- XML-escape the character lists.
- Default-off preserved.

## Test cases

```ts
// pptx.kinsoku = { lang:'ja-JP' } emits <p:kinsoku lang invalStChars invalEndChars>
// custom char lists are XML-escaped correctly
```

## Acceptance

- Schema fixture validates clean. Matrix "Kinsoku" → `✅ Done`.
- Docs + `CHANGELOG.md` `Added`.
