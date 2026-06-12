# Feature: Native Arc (`A`) & Smooth-Curve (`S`/`T`) Geometry in custGeom

> **Status:** Implemented (Unreleased)
> **Target:** `src/gen-utils.ts` — `svgPathToOoxml()`, the `<a:custGeom>` path-command parser used by the `svgPath` shape builder; tests `test/feature-arc-smooth-geometry.test.js`
> **Implemented:** `src/gen-utils.ts` (`svgPathToOoxml` now pre-folds the path through `normalizeSvgPath`) reusing the tested arc/smooth geometry (`arcToCubics`/`normalizeSvgPath`/`tokenizeSvgPath`) in `src/utils/parse-svg.ts`; tests `test/feature-arc-smooth-geometry.test.js`
> **Priority:** High — correctness fix (current behaviour emits garbage points) **and** eliminates 100+ lines of pre-normalisation in every consumer
> **Related:** `feature-svg-normalisation.md` (`parseSvg`), `feature-parse-card-structure.md`, `feature-icon-font-resolver.md`

## Problem

PptxGenJS' custom-geometry path parser handles only `M`/`L`/`H`/`V`/`C`/`Q`/`Z`.
When it meets an **elliptical arc** (`A`/`a`) or a **smooth curve** (`S`/`s`, `T`/`t`)
it does not recognise the command, so it consumes the following numbers as if they
were `lineTo` coordinates — producing garbage points that overflow the geometry space
and render as spikes/artefacts (or a broken shape that PowerPoint repairs).

Because of this, **every** consumer that feeds real-world SVG (icon sets like
Lucide/Feather/Font Awesome, brand logos, hand-authored paths) must pre-normalise
the path first — expanding `A`→cubic béziers, `S`→`C`, `T`→`Q`, and `H`/`V`→`L`,
tracking absolute/relative state and the previous control point. In the `html-to-pptx`
converter this is ~100+ lines (`arcToCubics`, the arc/smooth branches of
`normalizeSvgPath`, the `parseSvg` normalisation step). Doing it once, correctly, in
the library deletes that code for all consumers and fixes the correctness bug.

These commands have no native primitive in a custGeom `<a:path>`, so the fix is to
**convert them to the primitives OOXML does have** (`cubicBezTo`/`quadBezTo`/`lnTo`)
inside the parser — transparently to the caller.

## Proposed API

No new public API. The existing path inputs simply accept the full SVG command set:

```ts
slide.addShape('custGeom', {
  x: 1, y: 1, w: 1, h: 1,
  svgPath: {
    // A / S / T (and their lowercase relative forms) are now handled natively —
    // no caller-side pre-normalisation needed:
    d: 'M10 80 A 25 25 0 0 1 50 80 S 150 150 180 80 T 220 80 Z',
    viewBox: { w: 240, h: 160 },
  },
})
```

Equivalently for raw `<a:custGeom>` authoring via the path-points array, the parser
that backs it gains `A`/`S`/`T` cases.

## Behaviour

The parser is a single left-to-right pass that tracks: the current point
`(cx, cy)`, the sub-path start (for `Z`), the **previous command letter**, and the
**previous cubic control point** `(pcx, pcy)` and **previous quadratic control point**
`(qcx, qcy)` (for `S`/`T` reflection). Lowercase commands are relative to `(cx, cy)`.

### `H x` / `V y` → `<a:lnTo>` (confirm/keep)
Expand to a full point using the current coordinate: `H x` → `lnTo(x, cy)`,
`V y` → `lnTo(cx, y)`. (Already handled; this spec keeps it explicit.)

### `S x2 y2 x y` → `<a:cubicBezTo>` (smooth cubic)
A smooth cubic supplies only the **second** control point and the endpoint; the first
control point is inferred:
- If the previous command was `C`/`S` (a cubic), `cp1 = reflect(prevCubicCp2)` about
  the current point: `cp1 = (2*cx - pcx, 2*cy - pcy)`.
- Otherwise `cp1 = (cx, cy)` (the current point).

Emit `cubicBezTo(cp1, (x2,y2), (x,y))`. Update `prevCubicCp2 = (x2,y2)`.

### `T x y` → `<a:quadBezTo>` (smooth quadratic)
A smooth quadratic supplies only the endpoint; the single control point is inferred:
- If the previous command was `Q`/`T`, `cp = reflect(prevQuadCp)` about the current
  point: `cp = (2*cx - qcx, 2*cy - qcy)`.
- Otherwise `cp = (cx, cy)`.

Emit `quadBezTo(cp, (x,y))`. Update `prevQuadCp = cp`.

### `A rx ry φ large-arc sweep x y` → one-or-more `<a:cubicBezTo>` (elliptical arc)
Use the standard SVG **endpoint→centre** arc parameterisation (W3C SVG 1.1 Appendix
F.6.5 / F.6.6), then approximate the resulting arc with cubic béziers (≤ 90° per
segment for good accuracy):

```
1. If start == end: the arc is a no-op (skip).
2. If rx == 0 || ry == 0: emit lnTo(x, y)  (degenerate arc → straight line).
3. rx = |rx|, ry = |ry|;  φ = x-rotation in radians.
4. Compute (x1', y1') — the start point transformed into the rotated, un-skewed frame:
     dx = (cx - x)/2,  dy = (cy - y)/2
     x1' =  cosφ*dx + sinφ*dy
     y1' = -sinφ*dx + cosφ*dy
5. Correct out-of-range radii (F.6.6):
     Λ = x1'^2/rx^2 + y1'^2/ry^2;  if Λ > 1 then rx *= √Λ, ry *= √Λ
6. Compute the centre (cx', cy') in the rotated frame (sign depends on large≠sweep):
     sign = (large-arc !== sweep) ? +1 : -1
     num  = rx^2*ry^2 - rx^2*y1'^2 - ry^2*x1'^2  (clamp ≥ 0)
     den  = rx^2*y1'^2 + ry^2*x1'^2
     coef = sign * √(num/den)
     cx' =  coef * (rx*y1')/ry
     cy' = -coef * (ry*x1')/rx
7. Transform centre back:  cxc = cosφ*cx' - sinφ*cy' + (cx+x)/2,  cyc = sinφ*cx' + cosφ*cy' + (cy+y)/2
8. Compute start angle θ1 and sweep Δθ from vectors ((x1'-cx')/rx,(y1'-cy')/ry) and
     ((-x1'-cx')/rx,(-y1'-cy')/ry); adjust Δθ by ±2π per the sweep flag so its sign
     matches `sweep` and |Δθ| ≤ 2π.
9. Split [θ1, θ1+Δθ] into n = ceil(|Δθ| / (π/2)) segments; for each segment of angle β:
     k = (4/3)*tan(β/4)   (cubic control-point distance for an arc segment)
   and emit a cubicBezTo whose control points are the standard arc-segment cubic
   approximation, rotated by φ and translated to (cxc, cyc).
```

This yields 1–4 `cubicBezTo` elements per `A` command (one per ≤90° segment), so a
full circle/large arc splits into multiple béziers (handled by step 9). All output is
exact OOXML primitives — there is no native arc element in a custGeom path.

### Relative variants (`a`/`s`/`t`, and `c`/`q`/`l`/`h`/`v`/`m`)
Lowercase commands add the current point to their coordinates before the above logic
(for `A`, only the endpoint `x y` is relative; `rx ry φ flags` are not). The
reflection logic for `S`/`T` uses absolute control points after conversion.

### Coordinate scaling
As today, viewBox coordinates are scaled into the shape's EMU geometry space when the
`<a:pt>` values are written; the new cases produce points in the same coordinate space
as `L`/`C`/`Q`, so scaling is unchanged.

## Implementation location

Shipped via **reuse**, not duplication: `svgPathToOoxml()` in **`src/gen-utils.ts`**
pre-folds its input through the already-tested `normalizeSvgPath()` in
`src/utils/parse-svg.ts` before its single-pass `M/L/C/Q/Z` parser runs:

- `src/gen-utils.ts` — `import { normalizeSvgPath } from './utils/parse-svg'`, then at the
  top of `svgPathToOoxml` (after the input guard): `const pathD = normalizeSvgPath(svgPathD) || svgPathD`
  and parse `pathD`. `normalizeSvgPath` folds `A`→cubics (via `arcToCubics`, W3C F.6.5),
  `S`→`C` and `T`→`Q` (reflecting the previous control point), `H`/`V`→`L`, and
  relative→absolute, emitting only absolute `M`/`L`/`C`/`Q`/`Z` — exactly the subset the
  parser's `commandRegex` already covers. The parser's own `H`/`V`/relative branches become
  defensive no-ops on the pre-normalised input.
- `src/utils/parse-svg.ts` — already contains `arcToCubics(x1,y1,rx,ry,φdeg,large,sweep,x2,y2)`
  (returns ≤4 cubic segments, ≤90° each), `tokenizeSvgPath`, and `normalizeSvgPath`. It imports
  only a *type* from `core-interfaces`, so the `gen-utils → utils/parse-svg` runtime import is
  acyclic.
- No type/interface changes — `svgPath.d` already accepts a string; this widens the command
  set it understands.

> Note: a degenerate arc (`rx`/`ry` = 0) is emitted as a degenerate `cubicBezTo` whose
> control points collapse onto the start/end (geometrically a straight line) rather than a
> literal `lnTo`; the two are visually identical and render the same in PowerPoint.

Alternative (not taken): adding `case 'A'/'S'/'T'` directly to the parser switch would have
duplicated ~80 lines of the arc/smooth math that already lives, tested, in `parse-svg.ts`.

## OOXML mapping

| SVG command | OOXML emission |
|-------------|----------------|
| `M x y` | `<a:moveTo><a:pt x y/></a:moveTo>` |
| `L x y` | `<a:lnTo><a:pt x y/></a:lnTo>` |
| `H x` / `V y` | `<a:lnTo><a:pt …/></a:lnTo>` (expanded to full x,y) |
| `C x1 y1 x2 y2 x y` | `<a:cubicBezTo><a:pt/><a:pt/><a:pt/></a:cubicBezTo>` |
| `Q x1 y1 x y` | `<a:quadBezTo><a:pt/><a:pt/></a:quadBezTo>` |
| `A rx ry φ large sweep x y` | → computed cubic bézier segment(s) → one `<a:cubicBezTo>` each |
| `S x2 y2 x y` | → inferred C → `<a:cubicBezTo>` |
| `T x y` | → inferred Q → `<a:quadBezTo>` |
| `Z` | `<a:close/>` |

## Test cases

(See `test/feature-arc-smooth-geometry.test.js`.)

1. **Simple arc** — `M10 80 A 25 25 0 0 1 50 80`
   → `<a:moveTo>` then ≥1 `<a:cubicBezTo>`; no stray `<a:lnTo>` from mis-parsed args;
   the final `<a:pt>` lands at the scaled endpoint (50,80).
2. **Large-arc / sweep flag matrix** — same endpoints `M80 80 … 125 125` with
   `0 0`, `1 0`, `1 1` flags → all three produce valid cubic sequences, and the
   `1 …` (large-arc) variants emit **more** `cubicBezTo` segments than the small-arc
   one (arc split into ≥2 segments).
3. **Smooth cubic reflection** — `M10 80 C 40 10 65 10 95 80 S 150 150 180 80`
   → the second curve's first control point equals the reflection of the first
   curve's second control point about (95,80): `cp1 = (2*95-65, 2*80-10) = (125,150)`.
4. **Smooth quadratic reflection** — `M10 80 Q 52.5 10 95 80 T 180 80`
   → the `T` curve's control point = reflection of (52.5,10) about (95,80) =
   `(137.5,150)`, emitted as a `<a:quadBezTo>`.
5. **Degenerate arc** — `M10 80 A 0 0 0 0 1 50 80` → emits a `<a:lnTo>` to (50,80)
   (zero radii collapse to a straight line), no `cubicBezTo`.
6. **Rotated arc** — `M10 25 A 25 10 -30 0 1 50 25` → valid cubic sequence whose
   control points reflect the −30° x-rotation (not axis-aligned); endpoint at (50,25).
7. **Real-world FA icon** — the `fa-brain` solid path (contains multiple `A` arcs):
   parses end-to-end, every command consumed (no leftover numbers treated as points),
   and the bounding box of emitted points stays within the viewBox (no overflow spikes).
8. **Schema validation** — a deck with shapes built from arc/smooth paths passes the
   OOXML schema validator (`npm run schema-test`) with **0 errors**, and opens in
   PowerPoint without a "repair" prompt.

```js
// shape of an assertion (parser output XML)
const xml = await buildShapeXml(s => s.addShape('custGeom', { x:0,y:0,w:1,h:1,
  svgPath: { d: 'M10 80 A 25 25 0 0 1 50 80', viewBox: { w:100, h:100 } } }))
assert((xml.match(/<a:cubicBezTo>/g) || []).length >= 1)   // arc -> cubic(s)
assert((xml.match(/<a:lnTo>/g) || []).length === 0)        // NOT mis-parsed as lines
```

## Impact on converter

Once this ships, the `html-to-pptx` converter (and `parseSvg`) can delete their
normalisation layers and pass SVG paths through verbatim:

- **Delete** `arcToCubics()` (~60 lines) — the library does it.
- **Delete** the arc / `S` / `T` expansion branches of `normalizeSvgPath()` (~40 lines)
  and the "IMPORTANT: the engine only understands M/L/H/V/C/Q/Z …" comment block.
- **`parseSvg`** drops its command-normalisation step (it still resolves primitives →
  paths and gradients, but `d` strings — including arcs/smooth — pass straight through
  to `svgPath`).
- Consumers call `slide.addShape('custGeom', { svgPath: { d } })` with raw SVG path
  data; no per-consumer math.

Net: a correctness fix (no more overflow artefacts on arc/smooth paths) plus
~100 lines removed from the converter and from any other PptxGenJS consumer that
renders real-world SVG.
