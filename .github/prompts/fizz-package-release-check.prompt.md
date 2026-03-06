---
description: "Validate release readiness for a changed package in this monorepo (build, lint, tests, and API/doc impact)."
name: "Fizz: Package Release Check"
argument-hint: "Package name and change summary"
agent: "agent"
---

Perform a release-readiness check for one changed package.

Checklist:

- Confirm changed files pass Prettier checks.
- Confirm the package builds and lints.
- Confirm relevant tests pass.
- Identify public API changes from edited files.
- Flag docs/examples/changelog updates that should accompany the change.
- Call out backward-compatibility risks.

Output format:

1. Validation summary (pass/fail by area)
2. Validation commands executed and outcomes
3. API-impact notes
4. Required follow-up before release
