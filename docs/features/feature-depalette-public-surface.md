# Feature: De-palette the public surface (neutral defaults)

> **Status:** Implemented
> **Priority:** High — BREAKING; implements [ADR 0009](../architecture/decisions/0009-neutral-defaults.md).
> Land with/after the ADR 0008 icons-fa removal so the library breaks in coordinated
> chunks (multiple breaking chunks are approved — no external consumers yet).
> Source: overfitting audit 2026-06-13 (execution-verified; file:line receipts below).

## Problem

The one historical consumer's reference deck is fossilised into the public surface:

1. **`ThemePalette` public type** (types/utils.d.ts:21-44, extract-theme.ts:33-58):
   required slots `sky`, `coral`, `gray100/300/500`, `bgMid/bgLight/bgDeep` — the
   deck's `:root` variable names one-to-one, annotated "converter-equivalence".
2. **`add*` helper defaults are the deck's dark palette verbatim** (gen-objects.ts:
   976, 1064, 1090, 1111, 1120, 1152-1154, 1209, 1218, 1242, 1263, 1303, 1350):
   `1a1a24` fill, `2A2438` border (= deck `--bg-light`), `E4E4ED`/`8A8A9A` text,
   `94A3B8` attribution (= deck `--gray-300`), `7C3AED` everywhere. Executed:
   `addCard({fill:'FFFFFF'})` title contrast ≈1.3:1 (invisible); `addCallout` on
   Bootstrap warning-yellow = white-on-pale-yellow ≈1.1:1. No luminance check exists.
3. **`DEFAULT_EXCLUDE`** (parse-cards.ts:107) ships the consumer framework's class
   names (`anim-right|product-anim|flow|feed-item`) as a library parser default.
4. **Presets**: `DARK_PRESET`/`LIGHT_PRESET` carry Amazon `FF9900` as "orange",
   Tailwind hexes, and `font: 'Inter'` (extract-theme.ts:89-132).
5. **`bundled-icons.ts:16-32`**: "5 most common icons" = a fabricated-popularity set
   including the deck's `fa-trophy` (Goal #4 violation; ADR 0008 left it alone).

## Proposal (breaking)

1. `ThemePalette` v2: role-named (`bg, surface, surfaceRaised, text, textMuted,
   accent, accentSoft, info, success, warn, danger, neutral1..3, font`) + the existing
   open `vars` map for everything else. Remove the deck slots; no aliases (breaking
   approved). Update `extractThemeFromCSS`, presets, typings, parity test.
2. `add*` helpers: text/border/icon defaults **derived from the effective fill's
   luminance** (light fill → dark ink, dark fill → light ink); accent defaults become
   neutral greys unless the caller passes colours. Document the derivation.
3. `DEFAULT_EXCLUDE` → `undefined` (no exclusion by default); `excludeWithin` remains
   the consumer's knob. html-to-pptx already passes its own (verify, then bump dep).
4. Presets: real neutral values (CSS-standard hues where named), `font` default =
   `undefined` (caller/extraction supplies); delete `FF9900`.
5. `bundled-icons.ts`: shrink to an EMPTY default map (the resolver layers — custom
   resolver, pack option holdover until ADR 0008 lands, CDN opt-in — are the sources);
   delete the fabricated "common" set.

## Acceptance criteria

1. `grep -rn '7C3AED\|FF9900\|1a1a24\|2A2438\|94A3B8\|8A8A9A\|E4E4ED\|Inter' src/`
   hits only test fixtures/docs, zero library source defaults.
2. Executed: `addCard({fill:'FFFFFF'})` and `addCallout(text,{fill:'FFF3CD'})` produce
   text ≥ 4.5:1 contrast against their fills (write the luminance assertion as a test).
3. `parseCards` on a deck using class `product-anim` for its OWN cards detects them
   (no silent exclusion).
4. API parity green; typings updated; CHANGELOG `### Changed`/`### Removed` under the
   major; downstream coordination note for html-to-pptx (it must pass its palette
   explicitly — it already builds one in src/theme.js).

## Coordination

Converter side: `feature-deck-decoupling-purge.md` (its theme.js keeps the deck
palette — correctly, that's the consumer; it just stops leaking here). Release as part
of the next-major chunk train with ADR 0008.
