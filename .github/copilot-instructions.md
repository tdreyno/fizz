# Fizz Monorepo Copilot Instructions

## Repository Preferences

- `preferences.md` at the repo root is the source of truth for shared workflow and coding preferences.
- Do not duplicate policy content from `preferences.md` in this file. Reference it instead.

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

## Fizz Architecture Conventions

- Keep state-machine logic pure and explicit.
- Model transitions with `state(...)` and `stateWithNested(...)` patterns already used in `packages/fizz/src`.
- State handlers should return transitions/actions/effects in the same shapes already used by the runtime.
- Avoid introducing hidden side effects inside transition logic; use explicit `effect(...)` helpers.

## Testing Expectations

- Tests use Jest + `ts-jest` in ESM mode.
- Keep tests close to package code under `src/__tests__`.
- Follow existing spec naming (`*.spec.ts` / `*.spec.tsx`) and behavior-focused test descriptions.
- Use a red/green TDD workflow for generated code changes:
  - write or update a failing test first that captures the intended behavior (`red`)
  - implement the smallest code change needed to make the test pass (`green`)
  - refactor only after tests are green and keep behavior unchanged
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
  - Prettier: `npm exec -- prettier -- --write <changed-files>`
  - ESLint (from touched package): `npm run lint -- <changed-files-or-folder>`
  - Tests (from touched package): `npm run test` or `npm run test -- <spec-file-pattern>`
- For SonarQube scope and fallback rules, and `.github` Prettier exceptions, follow `preferences.md`.
- Report the exact validation commands run and outcomes in the final response.

## Change Hygiene

- Keep public API changes intentional and documented.
- Preserve backward compatibility unless explicitly asked to introduce a breaking change.
- Update docs/examples when behavior or API changes materially.

## Docs Authoring

- Prefer practical, explanatory prose over reference-style dumping. Start by naming the problem the page solves, then introduce the pattern or API, then walk through an example.
- When possible, base docs examples on real source, tests, or example apps already in the repository so the guide stays aligned with actual behavior.
- For conceptual pages, favor one worked example with a clear narrative over many disconnected snippets.
- Keep examples runnable in shape: include the imports, state or action definitions, and enough surrounding code that the example can be followed without guessing missing pieces.
- Avoid duplicating full API-reference detail in narrative docs when an API page already exists. Summarize the concept and link to the reference page for exact signatures.
- Add or update discoverability links when introducing an important guide: update `SUMMARY.md` when needed, add cross-links from adjacent docs, and keep `Related Docs` sections current.
- Use relative markdown links between docs pages and keep “What to read next” or “Related Docs” sections focused on the most relevant follow-up pages.
- For conceptual or workflow-heavy documentation, prefer adding small ASCII diagrams or flow charts in fenced `text` code blocks when they materially improve comprehension.
- Use diagrams especially for state transitions, nested state boundaries, runtime lifecycle, scheduling flows, and event propagation where prose alone is harder to follow.
- Keep diagrams compact, readable in monospaced font, and placed near the paragraph or example they clarify.
- Do not add decorative diagrams. Add them only when they explain structure, sequence, or boundaries more clearly than text alone.
