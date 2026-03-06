---
description: "Use when editing TypeScript source in fizz, fizz-react, or fizz-svelte packages. Covers strict typing, ESM import style, state-machine patterns, and package-local coding conventions."
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
- For state-machine code:
  - keep handlers deterministic
  - return transitions/actions/effects in existing runtime-compatible shapes
  - avoid adding implicit side effects inside handlers
- Avoid broad renames and formatting-only churn outside touched logic.
- Validate generated edits before completion:
  - run `npx prettier --check` on changed files (and `--write` if needed)
  - run `npm run lint` from each touched package, scoped to changed files when possible
  - run package tests when runtime behavior or public API surface changes
