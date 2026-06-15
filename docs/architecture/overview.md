# Architecture overview — @jsamuel1/pptxgenjs (PptxGenJS fork)

> Audience: anyone (human or agent) needing the system picture before touching code.
> Decisions are recorded in [decisions/](./decisions/README.md); the ordered work
> plan is [../../PROMPT.md](../../PROMPT.md); per-feature contracts live in
> [../features/](../features/); format coverage in
> [../FEATURE-MATRIX.md](../FEATURE-MATRIX.md).

This is a maintained fork of `gitbrent/PptxGenJS` (base v4.0.1), published as
`@jsamuel1/pptxgenjs`. It exists to author OOXML natively — animations,
transitions, gradients, and the HTML-extraction utilities the
`../html-to-pptx` converter consumes — instead of post-processing .pptx files
([ADR-0001](./decisions/0001-fork-not-postprocess.md)). The fork is the
"library" half of the library-first posture: generic capability lands here,
converters stay thin.

## Public surface (two entries)

`package.json#exports` publishes two entries, each with hand-maintained
typings in `types/*.d.ts` ([ADR-0003](./decisions/0003-hand-maintained-types-api-parity.md)):

| Entry | Built from | Contents |
|---|---|---|
| `.` | `src/pptxgen.ts` | the `PptxGenJS` class — presentations, slides, shapes, text, charts, tables, media, animations, transitions |
| `./utils` | `src/utils.ts` | dependency-free HTML/CSS/SVG extraction + layout helpers — no OOXML ([ADR-0002](./decisions/0002-utils-entry.md)) |

The `./icons-fa` subpath was removed in v5.0.0 per [ADR-0008](./decisions/0008-remove-icons-fa-pack.md); icon data distribution is the consumer's responsibility.

## Module map (`src/`)

**Core (OOXML authoring):**

| Module | Role |
|---|---|
| `pptxgen.ts` | main entry: presentation orchestration, output, layout definitions |
| `slide.ts` | the Slide API surface (addText/addShape/addChart/addCard/…) |
| `core-interfaces.ts` / `core-enums.ts` | public option types; OOXML constants and defaults |
| `gen-xml.ts` | master XML generator: slides, masters, relationships, animation timing (`<p:seq>`) |
| `gen-objects.ts` | shape/text/media object generators: fills, strokes, effects, 3D |
| `gen-charts.ts` / `gen-tables.ts` / `gen-media.ts` | chart XML, table layout, media encoding |
| `gen-utils.ts` | unit/colour conversion, gradient/shadow/glow builders, `layoutGrid()`/`layoutStack()` |
**`src/utils/` (the `/utils` entry — dependency-free, no OOXML):**
`html-dom.ts` (HTML tree + bounded selector engine), `parse-cards.ts`,
`parse-content.ts` (tables/columns/timelines/quotes/badges/callouts),
`parse-svg.ts`, `extract-theme.ts`, `css-context.ts` (cascade-lite CSS
resolution), `resolve-icon-fonts.ts`, `icon-classify.ts`, `bundled-icons.ts`,
`tokenize-code.ts`.

## Build and release

Rollup builds each entry twice: fast `src/bld/*` for tests, full `dist/*`
(`npm run ship`) for publishing — plus the self-contained browser bundle.
Tests import the **built public entry**, never private bundles
([ADR-0004](./decisions/0004-test-the-public-entry.md)). Releases are fully
CI-automated with hard gates — never published locally, never cut in the same
iteration as the implementation
([ADR-0007](./decisions/0007-automated-gated-releases.md); procedure in
[RELEASING.md](../../RELEASING.md)).

## Verification

- `test/run.js` — ~60 regression/feature files (exported `[{name, fn}]` cases;
  the runner validates the shape; success gate is the exit code).
- `test/run-schema.js` — every emitted change validates against the ECMA-376
  schema ([ADR-0005](./decisions/0005-schema-validate-clamp.md)); out-of-range
  inputs are clamped, never emitted verbatim and never thrown on.
- `test/feature-api-parity.test.js` — `types/*.d.ts` ↔ runtime exports, both
  directions.
- `test/release/` — real-render verification via Microsoft PowerPoint.
- Default-off invariant: a presentation not using a feature emits
  byte-identical XML ([ADR-0006](./decisions/0006-default-off-invariant.md)).

## Keeping this document honest

When a change alters the public surface, the module map, or the build/release
shape described here, update this file in the same commit — and if the change
reflects a new *decision* (a chosen direction with alternatives), record an
ADR in [decisions/](./decisions/README.md) too.
