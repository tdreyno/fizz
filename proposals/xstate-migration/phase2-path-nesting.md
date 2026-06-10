# Phase 2 Handoff — G5a Composed State Path + G3 Nested Ergonomics

Run order: 2 of 4. Independent of Phase 1 and Phase 3 (can run in parallel, but documented order is 2).
Closes G5a (dotted hierarchical path) and G3 (deep nested targeting ergonomics) from [`../fizz-xstate.md`](../fizz-xstate.md).

## Objective

- G5a: surface a deterministic composed path string for nested states (XState `state.toStrings()` parity) for logging/analytics.
- G3: make "mode + sub-step" decomposition easy without full XState deep `#id.a.b` targeting.

## Locked decisions

- G3 is solved with a documented recipe ("mode + sub-step") **plus** a small child-entry helper to enter a child region at a specific state.
  Do **not** implement full deep string-path targeting (`a.b.c`). Keep Fizz's explicit model.
- Additive; no breaking changes to `currentState`.

## API to implement

In `packages/fizz/src/nested.ts` (the nested machine lives in a child `Runtime` under the `NESTED` symbol):

- `getStatePath(stateOrRuntime, options?): string` — recurses `data[NESTED]` child runtime, joining names with `/`
  (e.g. `"Enabled/WriteConfig"`). Default separator `/`; allow `{ separator?: string }`.
- Child-entry helper for `stateWithNested`: allow specifying the child's initial state at enter time
  (a variant/option so a parent can enter a region at a chosen leaf instead of only the fixed `initialNestedState`).
  Keep it small and explicit — a function the parent's `Enter` can return, or an option on `stateWithNested`.

In `packages/fizz/src/runtime.ts`:

- `Runtime#currentStatePath(options?): string` — wraps `getStatePath(this.currentState(), options)`.
  Place near `currentState()` (`runtime.ts#L317`) / `currentHistory()` (`#L321`).

## Files

- EDIT `packages/fizz/src/nested.ts` — `getStatePath` + child-entry helper. (`stateWithNested` at ~L51; `NESTED`/`PARENT_RUNTIME` symbols.)
- EDIT `packages/fizz/src/runtime.ts` — `currentStatePath`.
- EDIT `packages/fizz/src/index.ts` — export `getStatePath` (sorted, `.js` suffix). Note `stateWithNested` is currently **not** exported from index — leave its export status unchanged unless tests require.
- EDIT/CREATE `packages/fizz/src/__tests__/nested.spec.ts` for path + child-entry tests.

## Reference patterns to reuse

- `stateWithNested` + `NESTED`/`PARENT_RUNTIME` symbols in `packages/fizz/src/nested.ts` (~L51-110) and `state.ts#L940`.
- `createInitialContext([initialNestedState])` bootstrap pattern in `nested.ts`.
- `StateTransition` (`state.ts#L861`): has `name`, `data`, `is`, `isNamed` — path is derived, not stored.
- `Runtime#currentState()` `runtime.ts#L317`.

## Tests (red/green TDD)

1. flat state: `getStatePath` returns just the state name (no separator).
2. one-level nested: returns `"Parent/Child"` reflecting the active child.
3. nested path updates after child transitions (forwarded `nestedActions`).
4. custom separator option respected.
5. `runtime.currentStatePath()` matches `getStatePath(runtime.currentState())`.
6. child-entry helper: parent enters region at a specified non-initial child state; path reflects it.

## Verification

- `npm run test --workspace @tdreyno/fizz -- nested`
- `npm run typecheck --workspace @tdreyno/fizz`
- `npm run lint --workspace @tdreyno/fizz -- src/nested.ts src/runtime.ts src/index.ts src/__tests__/nested.spec.ts`
- `npm exec -- prettier --write` on the above files.
- Sonar: automatic analysis OFF at start; `analyze_file_list` on edited files at end; analysis ON.

## Scope boundaries

- IN: composed path string, runtime accessor, small child-entry helper, tests.
- OUT: full deep `a.b.c` string targeting, visualizer changes, docs (Phase 4), history/observer work (Phase 3).

## Done when

Path + child-entry specs green; typecheck/lint/prettier clean; `currentState` shape unchanged (path is an additive accessor).
