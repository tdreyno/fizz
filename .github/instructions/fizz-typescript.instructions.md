---
description: "Use when editing TypeScript source in fizz or fizz-react packages. Covers strict typing, ESM import style, state-machine patterns, and package-local coding conventions."
name: "Fizz TypeScript Source Rules"
applyTo: "packages/*/src/**/*.{ts,tsx}"
---

# Fizz TypeScript Source Rules

- Preserve existing public APIs unless the task explicitly requires changing them.
- Prefer narrow, explicit types and existing exported utility types from `@tdreyno/fizz` before introducing new ones.
- Keep imports sorted and grouped by role:
  - external packages first
  - internal module imports second
  - `import type` where possible for type-only references
- Use local relative imports with `.js` suffix for package-internal modules.
- Match current source style:
  - no semicolons
  - small, focused helpers
  - functional patterns over class-based design
- Prefer functional transforms (`map`, `filter`, `flatMap`, `reduce`) over imperative loops when readability and performance are comparable.
- Optimize for human readability and simplicity by default:
  - use clear names
  - keep control flow easy to follow
  - avoid dense or overly clever expressions
- Use red/green TDD for generated code changes:
  - add or update a test that fails first to define expected behavior (`red`)
  - implement the minimal source change required for that test to pass (`green`)
  - perform any refactor only with tests passing and behavior preserved
- For state-machine code:
  - keep handlers deterministic
  - return transitions/actions/effects in existing runtime-compatible shapes
  - avoid adding implicit side effects inside handlers
- Avoid broad renames and formatting-only churn outside touched logic.
- Validate generated edits before completion:
  - run `npx prettier --check` on changed files (and `--write` if needed)
  - run `npm run lint` from each touched package, scoped to changed files when possible
  - run package tests when runtime behavior or public API surface changes
  - run local SonarQube scans for changed files and require a passing quality gate (fallback: touched package if changed-files scope is unavailable)
