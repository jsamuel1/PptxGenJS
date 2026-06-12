
## Intent review (project addendum — applies on top of the checklist above)

Correctness is necessary, not sufficient. Before `review.passed`, also verify the
increment honours the project's INTENT:

- Read `README-Fork.md → Goals` and the active `docs/feature-*.md` spec, including any
  `## Review findings` section (an open findings section is a fix contract — work
  that stacks on it without closing it is an automatic `review.rejected`).
- **Re-skin check:** does the change actually alter behaviour per the spec, or does
  it rename/move the old behaviour? (Incident: a "composition pipeline" that
  returned into the old single-archetype renderer, discarding co-extracted blocks.)
  Verify with an input that the OLD behaviour would get wrong.
- **Fabrication check:** does any new logic invent a stand-in for data the spec says
  must come from a real source (rankings, limits, metadata)? (Incidents: path-length
  and alphabetical order both shipped as "popularity".) If required data doesn't
  exist, the correct increment is to stop and record that.
- **Public-surface check:** for any new API, verify it through the BUILT public
  entry (`src/bld/utils.cjs.js` / the dist tarball shape), not an internal bundle —
  export present, typings declared, API-parity test green. (Incidents: three APIs
  shipped runtime-only or typings-only; one shipped reachable only via a test-only
  rollup entry.)
- **Silent-narrowing check:** machine-specific paths, skips-without-failure,
  one-style-of-several implementations (e.g. Solid handled, Regular/Brands
  silently ignored), or CI-only escapes that make a test a no-op locally are
  rejections, not nits.
- **Goal-conflict check:** if the increment moves the repo AWAY from any
  README-Fork Goal (e.g. weakens the default-off invariant, releases in the same
  iteration as the implementation, drops unknown OOXML parts on round-trip),
  reject and quote the Goal — even if the slice text asked for it; flag the
  conflict for the planner.

When rejecting on intent, name the Goal/spec line violated and the input that
demonstrates the deviation.
