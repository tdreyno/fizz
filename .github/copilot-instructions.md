# Fizz Monorepo Copilot Instructions

## Project Shape

- This is an npm workspaces monorepo using Turbo.
- Primary packages are:
  - `packages/fizz`: core state-machine runtime
  - `packages/fizz-react`: React hook integration (`useMachine`)
  - `packages/fizz-svelte`: Svelte store integration
- Prefer minimal, package-scoped changes. Avoid broad refactors unless requested.

## Language and Style

- Use TypeScript with strict typing. Avoid `any` unless existing code already relies on it and tightening types would be out of scope.
- Use ESM imports/exports.
- In package source, prefer local import specifiers with `.js` suffix (for example `./state.js`) to match build/runtime conventions.
- Follow repository linting conventions:
  - no semicolons
  - sorted imports/exports
  - use `import type` for type-only imports where appropriate
- Match existing functional style. Prefer plain functions and data-first helpers over classes.
- Prefer functional transforms (`map`, `filter`, `flatMap`, `reduce`) over imperative loops when readability and performance are comparable.
- Optimize generated code for human readability and simplicity first:
  - clear and descriptive names
  - small, focused helpers over large multi-purpose functions
  - low nesting and straightforward control flow
  - avoid clever or dense one-liners when a clearer form exists

## Fizz Architecture Conventions

- Keep state-machine logic pure and explicit.
- Model transitions with `state(...)` and `stateWithNested(...)` patterns already used in `packages/fizz/src`.
- State handlers should return transitions/actions/effects in the same shapes already used by the runtime.
- Avoid introducing hidden side effects inside transition logic; use explicit `effect(...)` helpers.

## Testing Expectations

- Tests use Jest + `ts-jest` in ESM mode.
- Keep tests close to package code under `src/__tests__`.
- Follow existing spec naming (`*.spec.ts` / `*.spec.tsx`) and behavior-focused test descriptions.
- When changing runtime behavior, add or update tests in the same package in the same change.

## Commands

- Install dependencies: `npm install`
- Build all packages: `npm run build`
- Lint all packages: `npm run lint`
- Run tests: `npm run test`
- CI-style tests: `npm run test:ci`
- Run one package test suite from repo root: `npm run test --workspace @tdreyno/fizz`

## Validation Workflow (Required)

- For any generated or edited code, run formatting, linting, tests, and SonarQube checks before finalizing.
- Prefer scoped validation for speed and signal:
  - Prettier: `npx prettier --check <changed-files>`
  - If Prettier fails: `npx prettier --write <changed-files>` then re-run `--check`
  - ESLint (from touched package): `npm run lint -- <changed-files-or-folder>`
  - Tests (from touched package): `npm run test` or `npm run test -- <spec-file-pattern>`
  - SonarQube (local only, changed files scope): run the local SonarQube scan for changed files and require a passing quality gate
- For instruction/prompt documentation files under `.github`, Prettier checks can be skipped.
- If multiple packages are touched, run lint/tests in each touched package.
- If changed-files Sonar scanning is not supported by local tooling, use the smallest practical fallback scope (touched package).
- Report the exact validation commands run and outcomes in the final response.

## Change Hygiene

- Keep public API changes intentional and documented.
- Preserve backward compatibility unless explicitly asked to introduce a breaking change.
- Update docs/examples when behavior or API changes materially.
