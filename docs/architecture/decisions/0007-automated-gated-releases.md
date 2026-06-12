# 0007 — Releases are CI-automated behind hard gates; never local, never same-iteration

- **Status:** Accepted
- **Date:** 2026

## Context

Releases were a recurring incident source: a spec marked Implemented and
released while its API was unreachable from the public surface; a release cut
in the same iteration that implemented the feature (no independent
verification gap); a release script that left the repo committing as a bot
identity; partial releases where the version bumped but npm publish never
ran.

## Decision

Releases run only through the GitHub Actions workflows (version-bump →
publish), never from a local machine; all release gates must pass (suite
green including API parity); a release is never cut in the same iteration
that implemented the feature; both workflow runs are watched to success and
the tag is pulled back and triple-checked (tag ↔ package.json ↔ npm) before
anything downstream is updated.

## Consequences

- "Released" has one meaning: live on npm with tag, changelog, and GitHub
  Release in agreement — downstream version bumps can trust it.
- Releasing is slower by design; the verification gap between implement and
  release is the point.
- Failure handling is conservative: stop and report intermediate state;
  blind re-dispatch double-bumps and is forbidden.
- The CHANGELOG rolls over mechanically in the workflow
  (`update-changelog.mjs`) — never by hand.
