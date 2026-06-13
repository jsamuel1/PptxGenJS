# Feature: Theme extraction that reads real-world CSS

> **Status:** Proposed
> **Priority:** High — pairs with feature-depalette-public-surface.md (ADR 0009).
> Source: overfitting audit 2026-06-13, execution-verified.

## Problem

`extractThemeFromCSS` only understands the reference deck's CSS dialect:

1. **Exact-name allowlist** (extract-theme.ts:138-178) with no prefix stripping:
   Bootstrap `--bs-primary`/`--bs-body-bg` → 0 of 11 matched; Material
   `--md-sys-color-primary` → total miss; both render as the purple dark preset.
2. **`:root`-only** (plus a whole-file fallback that dies if ANY `:root{}` exists,
   extract-theme.ts:358-363): `body{background:#fff;color:#222}` is never read.
3. **No light-mode inference** (`defaultPreset:'dark'`, :380): every unrecognised
   page ships dark.
4. **Frankenstein mixing** (:399-401, 426-427): partial light vars get dark-preset
   `bgMid` blended into a white bg → mud `cardFill`; near-white `gray100` text kept
   on white.
5. **Deck var-name semantics** (:146-177): `purple`→accent, `white`→text — promotes
   any deck's decorative purple to accent.

## Proposal

1. Prefix-aware canonicalisation: strip known framework prefixes (`bs-`,
   `md-sys-color-`, `mui-`, `tw-`…) before slot matching; map common token names
   (`primary`, `body-bg`, `body-color`, `surface`, `on-surface`…).
2. Fallback chain: `:root` vars → other custom-property blocks → `body{}`/`html{}`
   background/color rules → preset. The whole-file var fallback runs regardless of
   unrelated `:root` presence.
3. Light/dark inference from extracted bg luminance; derived colours (soft/grey
   mixes, cardFill/cardLine) mix toward the EXTRACTED fg/bg, never toward preset
   values when any bg/text was extracted (kills Frankenstein palettes).
4. Slot mapping by role only (with ThemePalette v2 from the depalette spec); the
   `purple→accent` deck aliasing moves to an optional `varAliases` option that the
   converter passes (it owns that dialect).

## Acceptance criteria (executed)

Bootstrap `:root` → accent `0d6efd`, light bg, `presetName:'extracted'`; Material
tokens → `6750a4` accent; `body{background:#fafafa;color:#222}` → light theme,
readable derived colours (no value within 10% luminance of its background); partial
light vars → no dark-preset values in any derived slot; the reference deck via the
converter's `varAliases` still extracts exactly its current palette (converter suite
green after dep bump).
