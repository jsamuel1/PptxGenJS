# PptxGenJS Fork — OOXML Feature Matrix

> **Purpose:** Map this fork's implementation surface against the OOXML
> (ECMA-376 PresentationML + DrawingML) feature set. This is the coverage map
> that drives the roadmap in [`PROMPT.md`](../PROMPT.md).
>
> **Last verified:** against `src/` at v4.1.7. The full animation surface
> (entrance `appear`/`fadeIn`/`flyIn`/`zoomIn`, emphasis, exit, and motion-path
> effects — §5), all fills (solid/gradient/glyph-gradient/pattern/picture — §3),
> click + hover + action-jump hyperlinks (§4), and the fork features (SmartArt,
> ink, handout master, custom shows, photo album, kinsoku, embedded fonts) are
> all implemented & schema-validated.
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
cannot author (OLE objects, ActiveX controls,
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
| ✅ Done | core slide/text/table/shape/image/media/chart + all fills (solid/gradient/glyph-gradient/pattern/picture), all hyperlinks (click/hover/action-jump), all effects (shadow/glow/reflection/soft-edge/3-D), full animation surface (entrance/emphasis/exit/motion-path) + fork features (SmartArt, ink, handout master, custom shows, photo album, kinsoku, embedded fonts) |
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
| Handout master | `p:handoutMasterIdLst` | ✅ Done | branded print layout via `pptx.defineHandoutMaster({ background, headerFooter })` |
| Custom shows | `p:custShowLst` | ✅ Done | subset slideshows via `pptx.addCustomShow()` |
| Photo album | `p:photoAlbum` | ✅ Done | `pptx.photoAlbum = { blackWhite?, showCaptions?, layout?, frame? }` → `<p:photoAlbum>` in `presentation.xml` (bw/showCaptions always emitted, layout/frame optional, default-off) |
| Embedded fonts | `p:embeddedFontLst` + `/ppt/fonts/*` | ✅ Done | `pptx.embedFont({ family, regular, bold?, italic?, boldItalic? })` packages `.ttf`/`.otf` faces (default-off) + sandbox-safe (uses `require` not dynamic `import()`) |
| Kinsoku (E-Asian breaks) | `p:kinsoku` | ✅ Done | `pptx.kinsoku = { lang?, invalStChars?, invalEndChars? }` → `<p:kinsoku>` in `presentation.xml` (ja-JP defaults, XML-escaped, default-off) |
| Multi-accent palette extraction | `a:clrScheme` (`a:accent1`–`a:accent6`) | ✅ Done | `ThemePalette.accents[]` extracts up to 6 OOXML accent colours ranked by usage prominence; Callout/Card accent bar defaults fall back through `accents[0]` before hardcoded hex |
| Password / encryption | `p:modifyVerifier` + package encryption | 🚫 Out of scope (authoring) | **Why:** real protection = encrypting the whole OOXML package into an OLE2/CFB container with ECMA-376 Part 2 *agile encryption* (AES + SHA-512 KDF) — a different output format than the ZIP JSZip emits, requiring heavy crypto deps (breaks the zero-dependency goal). `p:modifyVerifier` alone is only a legacy *modify*-protection hash (no content encryption) and gives a false sense of security, so we won't ship it in isolation. |

## 2. Slide-level objects

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Text boxes (rich runs) | `p:sp` + `a:txBody` | ✅ Done | bullets, multi-run, RTL, fonts |
| Tables | `a:tbl` in `a:graphicFrame` | ✅ Done | incl. col/row span |
| Shapes (preset geometry) | `a:prstGeom` | ✅ Done | full preset name set |
| Shapes (custom geometry) | `a:custGeom` | ✅ Done | via `svgPath` (full SVG path set: M/L/H/V/C/Q/S/T/A/Z + relative) |
| Shape grouping | `p:grpSp` | ✅ Done | `addGroup()` |
| Images | `p:pic` + `a:blipFill` | ✅ Done | incl. SVG, GIF, base64 |
| Media (video/audio) | `p:pic` + `a:videoFile`/`p14:media` | ✅ Done | incl. YouTube embed |
| Charts | `c:chart` in `a:graphicFrame` | ✅ Done | all major types + combo |
| Speaker notes (storage) | `p:notes` notesSlide | ✅ Done | `addNotes()` writes notes slide |
| **Talking-points notes export** | structured notes / per-build notes | ✅ Done | `slide.addNotes(NoteParagraph[])` — multi-paragraph bulleted/indented notes |
| Comments (modern) | `p:cm`, `cmAuthorLst` | ✅ Done | `slide.addComment()` → legacy `p:cm` + shared `commentAuthors.xml` (deduped authors); modern `p188`/`pc` threaded comments are a follow-up |
| SmartArt / diagrams | `dgm:*`, `dsp:*` | ✅ Done | `slide.addSmartArt({ layout:'list'\|'process', items, color? })` → five linked `/ppt/diagrams/*` parts (data/layout/quickStyle/colors + `dsp:drawing` cache) + `<p:graphicFrame>` w/ `<dgm:relIds>` + 5 slide rels + Content_Types overrides; minimal list/process subset. Cross-entity id invariant ×5 + default-off. See `docs/features/feature-smartart.md`. |
| OLE objects | `p:oleObj` + `/ppt/embeddings/*.bin` | 🚫 Out of scope (authoring) | **Why:** embedding Excel/Word means writing binary OLE compound-document parts and managing their fallback images + relationships. Niche for code-generated decks and high effort; no clean dependency-free path. *(Must still be preserved on slide copy.)* |
| VBA / macros | `.pptm` content-type + `/ppt/vbaProject.bin` | 🚫 Out of scope (authoring) | **Why:** requires emitting a binary `vbaProject.bin` (CFB) and switching the package to the macro-enabled content type. Carries security baggage (macro-enabled output) with little value for programmatic generation. *(Preserve on copy.)* |
| ActiveX controls | `p:control` + `/ppt/activeX/*.bin` | 🚫 Out of scope (authoring) | **Why:** needs binary ActiveX control persistence + COM-class metadata; Windows/PowerPoint-specific, security-sensitive, and effectively un-authorable in a portable JS library. *(Preserve on copy.)* |
| Ink | `p:contentPart` + InkML (`/ppt/ink/ink*.xml`) | ✅ Done | `slide.addInk({ strokes, color?, width? })` → per-call InkML part + `customXml` slide rel + bare `<p:contentPart r:id>` + Content_Types Override; strokes in inches → EMU. Cross-entity id invariant + default-off. See `docs/features/feature-ink.md`. |

## 3. Fills, lines & effects (DrawingML)

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Solid fill | `a:solidFill` | ✅ Done | |
| Gradient fill | `a:gradFill` | ✅ Done | multi-stop, linear/radial, per-stop alpha |
| Gradient text (glyph) fill | `a:gradFill` in `a:rPr` | ✅ Done | `addText({ color:{ type:'gradient', stops:[…] } })` → run-level gradient fills the glyphs (not the text-box background) |
| No fill | `a:noFill` | ✅ Done | |
| Pattern fill | `a:pattFill` | ✅ Done | preset hatch patterns (54 `ST_PresetPatternVal`) on shapes |
| Picture/blip fill (shapes) | `a:blipFill` on `p:sp` | ✅ Done | image-fill a shape (`type:'image'`, stretch/tile, transparency) |
| Line / border | `a:ln` | ✅ Done | width, dash, cap, color, transparency |
| Outer shadow | `a:outerShdw` | ✅ Done | `shadow` option |
| Glow | `a:glow` | ✅ Done | `glow` option |
| Reflection | `a:reflection` | ✅ Done | `reflection` option |
| Soft edge | `a:softEdge` | ✅ Done | `softEdge` option |
| 3-D (bevel/extrusion) | `a:sp3d`, `a:scene3d` | ✅ Done | `bevel` option (top/bottom bevel, depth/extrusion, contour, material; shapes only) |

## 4. Hyperlinks & actions

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Click hyperlink (URL/slide) | `a:hlinkClick` | ✅ Done | |
| Hover hyperlink | `a:hlinkMouseOver` / `a:hlinkHover` | ✅ Done | `hyperlink.on:'hover'`; text→`hlinkMouseOver`, shape/image→`hlinkHover` |
| Action jumps (next/prev/named/first/last) | `a:hlinkClick action=` | ✅ Done | `hyperlink.action:'nextSlide'\|'prevSlide'\|'firstSlide'\|'lastSlide'\|'endShow'\|'slide'` → `ppaction://hlinkshowjump?jump=<verb>` (rel-less); `'slide'` reuses `hlinksldjump` |

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
| Exit effects | `p:animEffect`/`p:set`/`p:anim` (out) | ✅ Done | disappear/fadeOut/flyOut/zoomOut; `presetClass="exit"`; tested |
| Motion paths | `p:animMotion` | ✅ Done | `presetClass="path"`; verbatim 0–1 path + `E` marker; targets `ppt_x`/`ppt_y`; tested |
| Counter (odometer) sugar | stacked `appear` frames | ✅ Done | fork sugar |

## 6. Headers / footers / placeholders

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Slide number placeholder | `a:fld type="slidenum"` | ✅ Done | |
| Date/time placeholder | `a:fld type="datetime"` | ✅ Done | |
| Footer text placeholder | `p:hf` + `ph type="ftr"` | ✅ Done | `defineSlideMaster({ headerFooter })` → derived layout `<p:hf>` + footer/date placeholders |
| Per-slide hf show/hide | `p:hf` attributes | ✅ Done | `slide.headerFooter = { footer, dateTime }` → per-slide ftr/dt placeholders (footer+date only; `<p:hf>` invalid on `CT_Slide` so slidenum toggle is a no-op — use `slide.slideNumber`) |
| Notes/handout headers | notes `p:hf` | ✅ Done | `pptx.notesMaster = { header, footer, slideNumber, dateTime }` → derived `<p:hf>` + hdr/ftr placeholder text in `notesMaster1.xml`. Handout master header/footer via `pptx.defineHandoutMaster({ headerFooter })` → `<p:hf>` in `handoutMaster1.xml` |

---

## 7. HTML content extraction (`@jsamuel1/pptxgenjs/utils`)

| Feature | Status | Notes |
|---------|--------|-------|
| `parseCards` — grid/flex/list card detection | ✅ Done | Bootstrap, Tailwind, MUI; custom selectors via pattern options |
| `parseBadges` — badge/pill/chip extraction | ✅ Done | Anchored class matching; unified vocabulary across parsers |
| `parseQuote` — blockquote/figure/q attribution | ✅ Done | WHATWG `figure>blockquote+figcaption`, `<footer>`, `<q>`, CJK glyphs |
| `parseTimeline` — chronological row extraction | ✅ Done | `<time datetime>` support; locale-independent; dedup-safe |
| `parseTable` — HTML table → slide table | ✅ Done | `colspan`/`rowspan` spanning |
| `parseColumns` — multi-column detection | ✅ Done | CSS Grid, `column-count`, and Flexbox paths |
| `tokenizeCode` — syntax highlighting tokenizer | ✅ Done | Explicit `lang` param; class-based fallback |
| Icon font resolver — CDN font loading | ✅ Done | FA/Bootstrap Icons/Ionicons; pinned CDN versions; default-off (`useCdn`) |
| `measureTextWidth` — script-aware text width | ✅ Done | Unicode-block fallback (CJK ≈ 1.0em, Latin ≈ 0.5em); optional sfnt font-file fast path; updates `addBadge` + `fit:'fill'` call sites |

---

## Roadmap ordering

The work order (driven from this matrix) lives in [`PROMPT.md` → Implementation Roadmap](../PROMPT.md#implementation-roadmap). Summary:

1. **Finish partials first** — pattern/picture shape fills, then **emphasis + exit** animations (the timing engine already emits real build steps, so these reuse existing infrastructure).
2. **Further shape work** — picture-fill polish.
3. **Timing depth** — emphasis variants, action jumps.
4. **Header/footer** — first-class hf config + per-slide show/hide.
5. **Then everything else** — SmartArt ✅, ink ✅, hover links ✅ — all landed.

**Out of scope (authoring only):** OLE objects, VBA/macros, ActiveX controls,
password/encryption — each requires binary part formats and/or whole-package
encryption that don't fit a portable, zero-dependency JS builder (see §1–§2 for
per-item rationale). **These remain in scope for copy fidelity:** a faithful
slide-copy/import path must preserve them verbatim (see the *Scope note* above).
