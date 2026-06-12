# 0002 — HTML/CSS/SVG extraction lives in a dependency-free `/utils` entry

- **Status:** Accepted
- **Date:** 2026

## Context

The `../html-to-pptx` converter (and any HTML-to-deck consumer) needs HTML
structure extraction (cards, tables, timelines, quotes), CSS theme/cascade
resolution, SVG normalisation, and icon resolution. Building those in each
converter duplicates DOM work and drags dependencies (cheerio) into sandboxed
environments; building them into the core entry would bloat every PPTX
consumer with HTML machinery.

## Decision

Generic extraction and layout helpers live in a separate `./utils` entry
(`src/utils/`): dependency-free, no OOXML emission, no Node-only APIs — an
HTML tree builder with a bounded selector engine, content extractors, theme
extraction, cascade-lite CSS context, SVG parsing, icon-font resolution.

## Consequences

- Converters shrink to orchestration; the converter repo deleted its cheerio
  dependency entirely. New extraction capability lands here first
  (the converter's "library-first" ADR is the consuming half).
- `/utils` carries its own discipline: everything exported needs typings in
  `types/utils.d.ts` (parity-tested) and must stay dependency-free and
  sandbox-safe — convenience dependencies are not an option.
- The selector engine is deliberately bounded; it grows by spec
  (e.g. `feature-html-tree-query.md`), not by reaching for a DOM library.
