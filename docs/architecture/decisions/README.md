# Architecture decision register

Lightweight ADRs: one file per decision, numbered, never deleted. A superseded
decision stays in place with its Status updated to point at the successor.

**When to write one:** you are choosing a direction that constrains future work
and had real alternatives — a seam, a public-surface posture, an invariant, a
strategy reversal. Point fixes and feature specs don't need one (specs live in
[../../features/](../../features/)); the *decision a spec rests on* does.

**Format** (keep it under a page): `Status` (Proposed / Accepted / Superseded
by NNNN), `Date`, `Context` (the forces, in a paragraph), `Decision` (one
sentence, imperative), `Consequences` (what gets easier, what gets harder,
what it forbids).

| # | Decision | Status |
|---|---|---|
| [0001](./0001-fork-not-postprocess.md) | Fork PptxGenJS and author OOXML natively, don't post-process .pptx | Accepted |
| [0002](./0002-utils-entry.md) | HTML/CSS/SVG extraction lives in a dependency-free `/utils` entry | Accepted |
| [0003](./0003-hand-maintained-types-api-parity.md) | Typings are hand-maintained with enforced API parity | Accepted |
| [0004](./0004-test-the-public-entry.md) | Tests import the built public entry, never private bundles | Accepted |
| [0005](./0005-schema-validate-clamp.md) | Every emit is schema-validated; out-of-range inputs clamp, never crash | Accepted |
| [0006](./0006-default-off-invariant.md) | New features are default-off; non-participating decks emit byte-identical XML | Accepted |
| [0007](./0007-automated-gated-releases.md) | Releases are CI-automated behind hard gates; never local, never same-iteration | Accepted |
| [0008](./0008-remove-icons-fa-pack.md) | Icon packs removed; icon data is the consumer's job (fetch-not-bundle) | Accepted |
| [0009](./0009-neutral-defaults.md) | Neutral defaults: no consumer aesthetics in the library surface | Accepted |
| [0010](./0010-balanced-workaround.md) | Balanced workarounds: fixes must solve the general case | Accepted |
| [0011](./0011-private-fork-breaking-changes-are-free.md) | Private fork: breaking changes are free; no major-bump or migration ceremony | Accepted |
