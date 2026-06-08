# PptxGenJS Fork — OOXML Feature Matrix

> **Purpose:** Map this fork's implementation surface against the OOXML
> (ECMA-376 PresentationML + DrawingML) feature set. This is the coverage map
> that drives the roadmap in [`PROMPT.md`](../PROMPT.md).
>
> **Last verified:** against `src/` at v4.1.3 (entrance animations
> `appear`/`fadeIn`/`flyIn`/`zoomIn` all confirmed implemented & tested).
>
> **Legend:**
> `✅ Done` — implemented & schema-validated ·
> `⚠️ Partial` — implemented with known limits ·
> `❌ Missing` — format supports it, library does not ·
> `🚫 Out of scope (authoring)` — not planned as a *programmatic authoring* API
> (see the scope note below); this does **not** mean such content may be dropped
> when copying existing slides.

---

## Scope note: authoring vs. copy fidelity

This matrix describes what the library can **author** — i.e. build from a
JavaScript API call. It is a separate question from **copy/round-trip
fidelity** when duplicating or importing an existing slide.

**Principle:** features marked `❌ Missing` or `🚫 Out of scope (authoring)`
are about *creating* that content from scratch. If/when slide-copy or
slide-import is implemented, it **must preserve every part, relationship, and
XML element of the source slide verbatim** — including features this library
cannot author (ink, OLE objects, ActiveX controls, embedded fonts, SmartArt,
etc.). Copy fidelity is a hard requirement, not a function of authoring
support: an unsupported feature is a reason not to expose a *builder* for it,
never a license to silently strip it from a faithful copy.

Concretely, a high-fidelity copy path should:

- carry over **all package parts** referenced by the slide (embeddings,
  `ink*.xml`, `oleObject*.bin`, `vbaProject.bin`, font parts, diagram parts)
  and their `_rels`, rewriting relationship IDs rather than discarding targets;
- preserve **unknown/foreign XML elements** in the slide tree (e.g. `extLst`
  extensions, `mc:AlternateContent`) untouched;
- keep `[Content_Types].xml` overrides for any copied part.

The `🚫 Out of scope (authoring)` label below therefore means "no builder API,"
**not** "safe to lose on copy."

---

## Status at a glance

| State | Count |
|-------|-------|
| ✅ Done | core slide/text/table/shape/image/media/chart + fork features |
| ⚠️ Partial | animations, shape fills, hyperlinks, effects |
| ❌ Missing | comments, talking-points notes export, embedded fonts, SmartArt, exit/motion animations, header/footer controls, custom shows, photo album, handout master, kinsoku, ink |
| 🚫 Out of scope (authoring) | OLE objects, VBA/macros, ActiveX controls, password/modifyVerifier |

---

## 1. Presentation container

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Slides / slide size | `p:sldIdLst`, `p:sldSz` | ✅ Done | |
| Slide masters | `p:sldMasterIdLst` | ✅ Done | `defineSlideMaster()` |
| Slide layouts | `p:sldLayout` | ✅ Done | placeholders supported |
| Notes master | `p:notesMasterIdLst` | ✅ Done | |
| Sections | `p:sectionLst` (ext) | ✅ Done | `addSection()` |
| Default text style | `p:defaultTextStyle` | ✅ Done | |
| Handout master | `p:handoutMasterIdLst` | ❌ Missing | |
| Custom shows | `p:custShowLst` | ❌ Missing | subset slideshows |
| Photo album | `p:photoAlbum` | ❌ Missing | |
| Embedded fonts | `p:embeddedFontLst` + `/ppt/fonts/*` | ❌ Missing | needed for portable decks; README markets "Asian fonts" but no embedding exists |
| Kinsoku (E-Asian breaks) | `p:kinsoku` | ❌ Missing | |
| Password / encryption | `p:modifyVerifier` + package encryption | 🚫 Out of scope (authoring) | **Why:** real protection = encrypting the whole OOXML package into an OLE2/CFB container with ECMA-376 Part 2 *agile encryption* (AES + SHA-512 KDF) — a different output format than the ZIP JSZip emits, requiring heavy crypto deps (breaks the zero-dependency goal). `p:modifyVerifier` alone is only a legacy *modify*-protection hash (no content encryption) and gives a false sense of security, so we won't ship it in isolation. |

## 2. Slide-level objects

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Text boxes (rich runs) | `p:sp` + `a:txBody` | ✅ Done | bullets, multi-run, RTL, fonts |
| Tables | `a:tbl` in `a:graphicFrame` | ✅ Done | incl. col/row span |
| Shapes (preset geometry) | `a:prstGeom` | ✅ Done | full preset name set |
| Shapes (custom geometry) | `a:custGeom` | ✅ Done | via `svgPath` (M/L/C/Q/H/V/Z) |
| Shape grouping | `p:grpSp` | ✅ Done | `addGroup()` |
| Images | `p:pic` + `a:blipFill` | ✅ Done | incl. SVG, GIF, base64 |
| Media (video/audio) | `p:pic` + `a:videoFile`/`p14:media` | ✅ Done | incl. YouTube embed |
| Charts | `c:chart` in `a:graphicFrame` | ✅ Done | all major types + combo |
| Speaker notes (storage) | `p:notes` notesSlide | ✅ Done | `addNotes()` writes notes slide |
| **Talking-points notes export** | structured notes / per-build notes | ❌ Missing | richer notes authoring (see PROMPT roadmap) |
| Comments (modern) | `p:cm`, `cmAuthorLst` | ❌ Missing | threaded review comments |
| SmartArt / diagrams | `dgm:*`, `dsp:*` | ❌ Missing | in scope (roadmap) |
| OLE objects | `p:oleObj` + `/ppt/embeddings/*.bin` | 🚫 Out of scope (authoring) | **Why:** embedding Excel/Word means writing binary OLE compound-document parts and managing their fallback images + relationships. Niche for code-generated decks and high effort; no clean dependency-free path. *(Must still be preserved on slide copy.)* |
| VBA / macros | `.pptm` content-type + `/ppt/vbaProject.bin` | 🚫 Out of scope (authoring) | **Why:** requires emitting a binary `vbaProject.bin` (CFB) and switching the package to the macro-enabled content type. Carries security baggage (macro-enabled output) with little value for programmatic generation. *(Preserve on copy.)* |
| ActiveX controls | `p:control` + `/ppt/activeX/*.bin` | 🚫 Out of scope (authoring) | **Why:** needs binary ActiveX control persistence + COM-class metadata; Windows/PowerPoint-specific, security-sensitive, and effectively un-authorable in a portable JS library. *(Preserve on copy.)* |
| Ink | `p:contentPart` + InkML (`/ppt/ink/ink*.xml`) | ❌ Missing (niche) | Reclassified from out-of-scope: technically tractable (InkML is plain XML referenced via a relationship — fits the existing add-part + emit-XML pattern, no new deps). Low priority only because stylus stroke data is rarely *authored* from code. |

## 3. Fills, lines & effects (DrawingML)

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Solid fill | `a:solidFill` | ✅ Done | |
| Gradient fill | `a:gradFill` | ✅ Done | multi-stop, linear/radial, per-stop alpha |
| No fill | `a:noFill` | ✅ Done | |
| Pattern fill | `a:pattFill` | ✅ Done | preset hatch patterns (54 `ST_PresetPatternVal`) on shapes |
| Picture/blip fill (shapes) | `a:blipFill` on `p:sp` | ✅ Done | image-fill a shape (`type:'image'`, stretch/tile, transparency) |
| Line / border | `a:ln` | ✅ Done | width, dash, cap, color |
| Outer shadow | `a:outerShdw` | ✅ Done | `shadow` option |
| Glow | `a:glow` | ✅ Done | `glow` option |
| Reflection | `a:reflection` | ❌ Missing | |
| Soft edge | `a:softEdge` | ❌ Missing | |
| 3-D (bevel/extrusion) | `a:sp3d`, `a:scene3d` | ❌ Missing | bevel enum exists for charts only |

## 4. Hyperlinks & actions

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Click hyperlink (URL/slide) | `a:hlinkClick` | ✅ Done | |
| Hover hyperlink | `a:hlinkHover` | ❌ Missing | |
| Action jumps (next/prev/named/first/last) | `a:hlinkClick action=` | ❌ Missing | ppaction:// jumps |

## 5. Transitions & timing/animations

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Slide transitions | `p:transition` | ✅ Done | fade/push/wipe/cover/split/cut + direction |
| Sequential build steps | `p:seq nodeType="mainSeq"` | ✅ Done | rewritten timing engine; real after/with-previous |
| Entrance: `appear` | `p:set` | ✅ Done | |
| Entrance: `fadeIn` | `p:animEffect filter="fade"` | ✅ Done | |
| Entrance: `flyIn` | `p:anim` on `ppt_x/ppt_y` | ✅ Done | directional |
| Entrance: `zoomIn` | two `p:anim` on `ppt_w`/`ppt_h` | ✅ Done | scales 0 → full; `presetID=23`; tested |
| Emphasis effects | `p:animClr`, `p:animScale`, `p:animRot` | ✅ Done | pulse/spin/grow/colorPulse; `presetClass="emph"`; tested |
| Exit effects | `p:animEffect`/`p:set` (out) | ❌ Missing | counterpart to entrance; infra exists |
| Motion paths | `p:animMotion` | ❌ Missing | |
| Counter (odometer) sugar | stacked `appear` frames | ✅ Done | fork sugar |

## 6. Headers / footers / placeholders

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Slide number placeholder | `a:fld type="slidenum"` | ✅ Done | |
| Date/time placeholder | `a:fld type="datetime"` | ✅ Done | |
| Footer text placeholder | `p:hf` + `ph type="ftr"` | ⚠️ Partial | basic placeholders; no first-class header/footer config API |
| Per-slide hf show/hide | `p:hf` attributes | ❌ Missing | toggle date/footer/slidenum per slide/master |
| Notes/handout headers | notes `p:hf` | ❌ Missing | |

---

## Roadmap ordering

The work order (driven from this matrix) lives in [`PROMPT.md` → Implementation Roadmap](../PROMPT.md#implementation-roadmap). Summary:

1. **Finish partials first** — pattern/picture shape fills, then **emphasis + exit** animations (the timing engine already emits real build steps, so these reuse existing infrastructure).
2. **Further shape work** — reflection, soft edge, 3-D; picture-fill polish.
3. **Timing depth** — motion paths, emphasis variants, action jumps.
4. **Header/footer** — first-class hf config + per-slide show/hide.
5. **Then everything else** — comments, talking-points notes export, embedded fonts, SmartArt, handout master, custom shows, photo album, kinsoku, hover links, **ink** (niche but tractable).

**Out of scope (authoring only):** OLE objects, VBA/macros, ActiveX controls,
password/encryption — each requires binary part formats and/or whole-package
encryption that don't fit a portable, zero-dependency JS builder (see §1–§2 for
per-item rationale). **These remain in scope for copy fidelity:** a faithful
slide-copy/import path must preserve them verbatim (see the *Scope note* above).
