# Agent instructions — PptxGenJS fork (@jsamuel1/pptxgenjs)

You are working in the PptxGenJS fork. Before any work, internalise:

1. **[README-Fork.md → Goals](./README-Fork.md#goals)** — the fork's standing
   intentions. Work that satisfies its task but contradicts a Goal is wrong, even
   with green tests. Recurring failure modes these guard against, each of which has
   actually shipped here: public APIs unreachable from the public surface (no
   export/typings); fabricated stand-ins for missing data (a "popularity" rank
   invented from alphabetical order); releases cut in the same iteration as the
   implementation; test-only bundles standing in for the public entry.
2. **[CONTRIBUTING.md](./CONTRIBUTING.md)** / **[TESTING.md](./TESTING.md)** /
   **[RELEASING.md](./RELEASING.md)** — canonical conventions: spec lifecycle,
   definition of done for public APIs, explicit-path staging, release gates and the
   push→dispatch→watch-both→pull-back procedure.
3. **[PROMPT.md](./PROMPT.md)** — the ordered work queue; `autoloop task list` is
   the shared steering channel — check it every iteration and mark items complete.

**For reviewer/critic roles specifically:** your job includes *intent* review, not
only correctness. Read the active `docs/feature-*.md` spec including any
`## Review findings` section (fix contracts; work stacking on a spec with open
findings is rejectable on that ground alone). When an increment passes tests but
deviates from a Goal or the spec's stated purpose — or invents data the spec says
must come from a real source — reject and quote the specific Goal/spec line.
