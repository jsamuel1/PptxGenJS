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
> `🚫 Out of scope` — intentionally not planned

---

## Status at a glance

| State | Count |
|-------|-------|
| ✅ Done | core slide/text/table/shape/image/media/chart + fork features |
| ⚠️ Partial | animations, shape fills, hyperlinks, effects |
| ❌ Missing | comments, talking-points notes export, embedded fonts, SmartArt, pattern/picture fills, emphasis/exit/motion animations, header/footer controls, custom shows, photo album, handout master, kinsoku |
| 🚫 Out of scope | OLE objects, VBA/macros, ActiveX controls, password/modifyVerifier, ink |

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
| Modify verifier (password) | `p:modifyVerifier` | 🚫 Out of scope | |

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
| OLE objects | `p:oleObj` | 🚫 Out of scope | embedded Excel/Word |
| ActiveX controls | `p:control` | 🚫 Out of scope | |
| Ink | `p:contentPart` (inkml) | 🚫 Out of scope | |

## 3. Fills, lines & effects (DrawingML)

| Feature | OOXML | Status | Notes |
|---------|-------|--------|-------|
| Solid fill | `a:solidFill` | ✅ Done | |
| Gradient fill | `a:gradFill` | ✅ Done | multi-stop, linear/radial, per-stop alpha |
| No fill | `a:noFill` | ✅ Done | |
| Pattern fill | `a:pattFill` | ❌ Missing | preset hatch patterns |
| Picture/blip fill (shapes) | `a:blipFill` on `p:sp` | ❌ Missing | image-fill a shape (tile/stretch) |
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
| Emphasis effects | `p:animClr`, `p:animScale`, `p:animRot` | ❌ Missing | pulse/spin/grow/color |
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
5. **Then everything else** — comments, talking-points notes export, embedded fonts, SmartArt, handout master, custom shows, photo album, kinsoku, hover links.

**Out of scope:** OLE objects, VBA/macros, ActiveX controls, password protection, ink.
