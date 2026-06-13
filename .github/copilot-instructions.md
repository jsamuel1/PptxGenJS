All agent guidance for this repository lives in the repo-root `AGENTS.md` —
read it first. It points to the project Goals, CONTRIBUTING.md / TESTING.md
(and RELEASING.md where present), the architecture decision register under
`docs/architecture/decisions/`, and the work queue in `PROMPT.md`. Key rules:
stage commits explicitly by path (never `git add -A`); a test run passes only
on exit code 0; feature specs in `docs/features/` are contracts — read the
spec (including any `## Review findings` section) before touching the source;
never invent stand-in data when a spec requires a real source.
