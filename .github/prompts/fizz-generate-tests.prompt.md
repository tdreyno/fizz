---
description: "Generate or improve Jest tests for changed Fizz code with emphasis on transition correctness and async behavior."
name: "Fizz: Generate Tests"
argument-hint: "Point to files/functions to test"
agent: "agent"
---

Write high-value Jest tests for the selected Fizz code.

Test focus:

- Transition correctness (`state`, `update`, nested transitions)
- Effect execution order and presence
- Async behavior (promises and runtime execution)
- Regression coverage for edge cases

Constraints:

- Match the local package's existing test style and naming.
- Keep tests deterministic and avoid brittle timing assumptions.
- Prefer behavior-level assertions over implementation details.
- Before finalizing, validate generated changes:
  - run `npx prettier --check <changed-files>` (then `--write` and re-check if needed)
  - run `npm run lint` in the touched package for changed test/source files
  - run relevant package tests, preferably targeted to the changed specs

Output format:

1. New or updated test cases
2. Why each case matters
3. Gaps not covered
4. Validation commands executed and outcomes
