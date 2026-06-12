# 0001 — Fork PptxGenJS and author OOXML natively, don't post-process .pptx

- **Status:** Accepted
- **Date:** 2026 (founding decision)

## Context

Automated HTML-to-PPTX pipelines needed slide transitions, shape animations,
gradient fills, and header/footer support that upstream `gitbrent/PptxGenJS`
(v4.0.1) does not provide. The prior approach — generating a deck and then
editing its XML parts post-hoc — was brittle: every upstream output change
broke the patches, and the patched XML was never schema-checked.

## Decision

Maintain a fork (`@jsamuel1/pptxgenjs`) that authors the missing OOXML
natively — a rewritten animation timing engine (`<p:seq>` build steps),
transitions, gradients, header/footer, counters — plus correctness fixes,
versioned alongside upstream's 4.x line.

## Consequences

- Consumers get one schema-validated authoring path; the post-processing
  layer is deleted.
- The fork owns a real maintenance surface: upstream drift must be merged,
  and fork additions need their own tests, typings, docs, and releases —
  hence the conventions in CONTRIBUTING/TESTING/RELEASING.
- Copy fidelity stays sacred: what the fork can't author it must still
  round-trip verbatim (never strip unknown parts).
- Authoring scope is bounded: OLE/VBA/ActiveX/encryption stay out of scope
  (binary part formats that don't fit a portable zero-dependency builder).
