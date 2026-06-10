# Phase 3 Handoff — G4 Flow History + G5b Triggering Action

Run order: 3 of 4. Builds on Phase 2's path helper (uses `getStatePath`/`currentStatePath` for flow strings).
Closes G4 (telemetry-grade transition history / flow) and G5b (triggering-action access from observers) from [`../fizz-xstate.md`](../fizz-xstate.md).

## Objective

- G4: first-class "what path did this run take" — ordered visited state names + comma-joined flow string.
- G5b: let observers access the action that caused a transition (XState `state.event.data` parity) without the machine modeling it.

## Locked decisions

- G5b is delivered with an **additive** `onTransition(fn)` on the runtime + an extended fizz-react subscription.
  The existing `onContextChange(fn)` signature stays **unchanged** (still `(context) => void`).
- Additive history enrichment: keep existing history state accessors working.

## API to implement

In `packages/fizz/src/context.ts` (History at ~L11):

- Enrich history entries to optionally carry the causing action alongside the `StateTransition`.
  Keep current accessors (`current`, `previous`, `toArray()` newest-first) returning state transitions for back-compat;
  add a parallel accessor for action-annotated entries (e.g. `currentEntry` / `toEntries()` returning `{ state, action }`).

In `packages/fizz/src/runtime.ts`:

- `Runtime#onTransition(fn: (info: { state, previousState, action }) => void): () => void`
  fired from the `#contextDidChange()` path (`runtime.ts#L634`) where the causing action is known. Returns an unsubscribe.
- `Runtime#lastAction(): Action | undefined` — most recent triggering action.
- `Runtime#getVisitedStateNames(): string[]` — ordered (oldest → newest) names from history (use `getStatePath` from Phase 2 for nested).
- `Runtime#getFlow(separator = ","): string` — `getVisitedStateNames().join(separator)`.
- Mirror exports/types in `runtime.ts` + `runtime/runtimeContracts.ts` as needed.

In `packages/fizz-react/src/useMachineSubscription.ts` (current listener `(state, context)` at ~L41-77):

- Extend so subscribers can access the triggering action. Prefer **additive**: a new `useTransition(machine, listener)` hook
  where `listener` receives `{ state, previousState, action, context }`, wired to `runtime.onTransition`.
  Do **not** break the existing `useMachineSubscription(state, context)` signature.

## Files

- EDIT `packages/fizz/src/context.ts` — action-annotated history entries (additive).
- EDIT `packages/fizz/src/runtime.ts` — `onTransition`, `lastAction`, `getVisitedStateNames`, `getFlow`.
- EDIT `packages/fizz/src/runtime/runtimeContracts.ts` — types for transition info if needed.
- EDIT `packages/fizz/src/index.ts` — export any new public types (sorted).
- EDIT `packages/fizz-react/src/useMachineSubscription.ts` — add `useTransition` (or additive overload).
- EDIT `packages/fizz-react/src/index.ts` — export `useTransition` (sorted).
- TESTS: `packages/fizz/src/__tests__/runtime.*.spec.ts` (history/flow/onTransition) and a fizz-react subscription spec.

## Reference patterns to reuse

- `onContextChange` / `#contextDidChange` `runtime.ts#L325`, `#L634`.
- `Context` shape + `History` `context.ts#L11`, `#L156`.
- Monitor `context-changed`/`action-enqueued` events `runtime/runtimeContracts.ts#L59`, `#L78` (action is known there — leverage for correlation).
- fizz-react listener wiring `useMachineSubscription.ts#L41`, `useSelector` `#L114`.

## Tests (red/green TDD)

1. `getVisitedStateNames` returns ordered names across multiple transitions.
2. `getFlow()` joins with default comma; custom separator respected.
3. nested machine flow uses composed path (Phase 2) per visited state.
4. `onTransition` fires with `{ state, previousState, action }`; returns a working unsubscribe.
5. `lastAction` reflects the most recent causing action; undefined before first action.
6. `onContextChange` still `(context) => void` (regression guard).
7. fizz-react `useTransition` delivers triggering action; existing `useMachineSubscription` unchanged (regression).

## Verification

- `npm run test --workspace @tdreyno/fizz -- runtime`
- `npm run test --workspace @tdreyno/fizz-react -- subscription transition`
- `npm run typecheck --workspace @tdreyno/fizz` and `--workspace @tdreyno/fizz-react`
- `npm run lint` on touched files in each package.
- `npm exec -- prettier --write` on touched files.
- Sonar: automatic analysis OFF at start; `analyze_file_list` at end; analysis ON.

## Scope boundaries

- IN: action-annotated history, runtime flow/`lastAction`/`onTransition`, fizz-react `useTransition`, tests.
- OUT: changing `onContextChange` signature, docs (Phase 4), routing/path implementation (Phases 1-2 prerequisites).

## Done when

New runtime + react specs green; back-compat regression specs green; typecheck/lint/prettier clean.
