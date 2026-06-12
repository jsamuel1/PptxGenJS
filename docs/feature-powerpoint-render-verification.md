# Feature: Real-render verification via Microsoft PowerPoint (macOS)

> **Status:** Implemented (2026-06-12) — `test/release/powerpoint.test.js` +
> `test/release/_pdf2png.jxa.js`, wired as `npm run test:ppt` and into
> `npm run release-test`. **Implementation deviation:** PowerPoint 26.x's
> AppleScript `save … as save as PNG` is a silent no-op (returns success, writes
> nothing — verified against /tmp, $HOME and the app's sandbox container), while
> `save as PDF` works. The tier therefore exports PDF and rasterises one PNG per
> page with stock PDFKit (JXA), preserving the per-slide count + non-trivial-size
> assertions. Acceptance criteria validated on PowerPoint 26.5 / macOS 26.5:
> green run (8-slide showcase), CI=1 loud-skip exit 0, and a corrupted
> `ppt/presentation.xml` copy blocking on the repair path (-1712 with the process
> running → diagnostic failure).
> **Priority:** High (testing infrastructure — schema validation proves the OOXML is
> well-formed; only PowerPoint's own engine proves the artifacts open and render)

## Problem

The regression and schema suites assert on emitted XML; `npm run release-test` drives
browsers and Node but never the actual consumer application. Files that pass the OOXML
schema can still hit PowerPoint's "repair" dialog or render wrongly — the class of bug
nothing automated currently catches. TESTING.md's PowerPoint checks are entirely
manual.

## Proposal

A new tier `npm run test:ppt` (`test/release/powerpoint.test.js`, joining the existing
release-test harness) that drives installed Microsoft PowerPoint via AppleScript on
macOS against a generated showcase deck (one slide per major feature: text/fit,
gradient + pattern + picture fills, effects, table, chart, card, code block,
transition + animation markers):

1. Generate the deck with the freshly built library (`src/bld/pptxgen.cjs.js`).
2. `open` in PowerPoint within `with timeout`; **successful open is the headline
   assertion** (repair prompt ⇒ timeout ⇒ failure). Read `count of slides` from the
   live presentation and assert it matches what was authored.
3. `save … as save as PNG`; assert one PNG per slide, each > 10 KB.
4. `close … saving no`; never quit the app (a developer may be using it).

### Gate semantics

- **CI (`CI`/`GITHUB_ACTIONS` set): SKIP loudly** — GitHub-hosted macOS runners carry
  no Office install. A future self-hosted Mac runner with Office opts in via
  `RUNNER_HAS_POWERPOINT=1`.
- **macOS without PowerPoint installed**: loud SKIP naming the tier;
  `REQUIRE_POWERPOINT=1` escalates to failure.
- **Non-macOS**: loud skip.
- **AppleEvent timeout (-1712) with the process running: FAIL** with the diagnostic
  "a modal (first-run welcome / sign-in / repair prompt) is blocking PowerPoint —
  open it manually, dismiss dialogs, re-run". Error -1743 reports the macOS
  Automation-permission steps. Skips must appear in the suite summary — never a bare
  PASS over a skipped tier (see the downstream silent-skip incident).

The AppleScript core is proven (see the html-to-pptx twin spec,
`feature-powerpoint-render-verification.md` there — validated on PowerPoint 16.109 up
to the first-run-modal failure mode, which is handled above).

## Affected files

- `test/release/powerpoint.test.js` (new) + wiring into `npm run release-test`
  and a standalone `npm run test:ppt`
- `TESTING.md` — move "open the deck in PowerPoint" from purely manual to automated
  (playback/animation verification stays manual — AppleScript export cannot assert
  motion)
- `RELEASING.md` — add the tier to the release gates when run on a Mac

## Acceptance criteria

1. On a Mac with PowerPoint: `npm run test:ppt` builds, generates, opens, counts,
   exports, closes — green; no presentation left open.
2. `CI=1` exits 0 with the loud skip; no app launch.
3. A deliberately corrupted copy (one flipped byte in `ppt/presentation.xml`) FAILS
   the tier — proving it catches repair-class corruption that schema validation
   passes.
4. Release gates reference the tier; `npm run release-test` summary shows the tier as
   run or loudly-skipped, never silently absent.
