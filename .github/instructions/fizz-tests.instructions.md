---
description: "Use when writing or updating Jest tests in this repository, especially runtime/state-machine behavior tests in packages/*/src/__tests__. Covers conventions for spec style, assertions, and ESM TypeScript setup."
name: "Fizz Test Rules"
applyTo:
  [
    "packages/*/src/**/__tests__/**/*.ts",
    "packages/*/src/**/__tests__/**/*.tsx",
  ]
---

# Fizz Test Rules

- Use Jest test structure that matches existing files: `describe(...)` + `test(...)` with behavior-focused names.
- Keep tests in package-local `src/__tests__` folders using `*.spec.ts` or `*.spec.tsx`.
- Prefer asserting user-visible behavior of state transitions and runtime effects, not internal implementation details.
- For async behavior, use `async/await` and assert awaited outcomes explicitly.
- Reuse existing helpers/utilities in `__tests__/util.ts` when they already fit.
- Keep fixtures simple and local to the test file unless shared across multiple specs.
- When fixing a bug, add a regression test that fails before the fix and passes after.
- Validate test changes before completion:
  - run `npx prettier --check` on changed test files (and `--write` if needed)
  - run `npm run lint` in the touched package for updated test files
  - run the relevant package tests (targeted spec runs are preferred)
