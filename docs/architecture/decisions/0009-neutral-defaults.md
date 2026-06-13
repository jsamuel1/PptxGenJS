# 0009 — Neutral defaults: no consumer aesthetics in the library surface

> **Status:** Accepted (2026-06-13) — maintainer direction; breaking changes approved,
> may land in multiple chunks (no external consumers yet).

## Context

A 2026-06-13 overfitting audit (two independent execution-based reviews) found the
fork's one historical consumer — the html-to-pptx reference deck — recoverable almost
verbatim from the library source: its `:root` variable names as the required slots of
the public `ThemePalette` type ("converter-equivalence"), its palette as the `add*`
helpers' `@default` colours (`1a1a24`, `2A2438`, `94A3B8`, `7C3AED`, Amazon `FF9900`
as "orange"), its framework class names compiled into `parseCards`' `DEFAULT_EXCLUDE`,
its font (`Inter`) as both presets' default, and its icon usage as the "5 most common"
bundled icons. Executed consequences: `addCard({fill:'FFFFFF'})` renders its title at
≈1.3:1 contrast; a white Bootstrap page themes as a purple dark deck.

## Decision

The library's defaults must be **neutral or derived — never any single consumer's
aesthetics**:

1. Public types use **role names** (`accent`, `info`, `neutral1..3`, `surface*`), not
   one deck's variable names. Deck-specific slots are removed (breaking) — consumers
   carry their own palettes via the open `vars` map / options.
2. `add*` helper text/border defaults are **derived from the fill's luminance** (or
   plain neutral); no hardcoded palette hex anywhere a caller didn't pass.
3. Parser/extractor defaults contain **no consumer vocabulary** (class names, brand
   fonts, icon lists). Anything heuristic is exposed as an option with a documented
   neutral default.
4. Network is **opt-in** (`useCdn` defaults false) and remote sources are
   version-pinned.

## Consequences

- Implemented via `feature-depalette-public-surface.md` (breaking chunk, next major
  with ADR 0008) and `feature-theme-extraction-generality.md`.
- The intent critic treats a new hardcoded aesthetic default as a Goal violation.
- The downstream converter owns its own palette and passes it explicitly.
