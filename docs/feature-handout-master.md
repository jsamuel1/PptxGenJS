# Feature: Handout Master (`p:handoutMasterIdLst`)

> **Status:** Proposed
> **Priority:** Low — Phase 4 (matrix `❌ Missing` → `✅`)
> **Matrix row:** §1 Presentation container — "Handout master"

## Problem

The library defines slide masters and a notes master, but not a **handout
master** (the layout used when printing multiple slides per page). Decks that
need branded handout headers/footers can't set this.

## Proposed API

```ts
pptx.defineHandoutMaster({
  background?: 'FFFFFF',
  headerFooter?: { header?: 'Internal', footer?: 'Confidential', dateTime?: true, slideNumber?: true },
})
```

## What it generates (OOXML)

A handout master part + reference + Content_Types/rels:

```
/ppt/handoutMasters/handoutMaster1.xml   <p:handoutMaster>…<p:cSld>…<p:hf .../></p:handoutMaster>
/ppt/presentation.xml:
  <p:handoutMasterIdLst><p:handoutMasterId r:id="rIdN"/></p:handoutMasterIdLst>
```

`<p:handoutMasterIdLst>` appears in `CT_Presentation` order **after**
`notesMasterIdLst` and **before** `sldIdLst` (consistent with the B20 ordering
work).

## Implementation location

- `src/core-interfaces.ts` — `HandoutMasterProps`.
- `src/pptxgen.ts` — package the handout master part + rels + Content_Types.
- `src/gen-xml.ts` — emit `<p:handoutMasterIdLst>` in canonical position.

## Edge cases

- Optional — most decks won't define one; default-off preserved.
- Reuses the header/footer config (see `feature-header-footer.md`).

## Test cases

```ts
// defineHandoutMaster creates handoutMaster1.xml + rel + Content_Types,
// and emits <p:handoutMasterIdLst> after notesMasterIdLst, before sldIdLst
```

## Acceptance

- Schema fixture validates clean; presentation child order valid.
- Matrix "Handout master" → `✅ Done`. Docs + `CHANGELOG.md` `Added`.
