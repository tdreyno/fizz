# Phase 1 Handoff — G1 Declarative Guarded Transient Transitions

Run order: 1 of 4. Independent. Closes the highest-priority gap (G1) from [`../fizz-xstate.md`](../fizz-xstate.md).

## Objective

Add first-class, declarative ordered-guard routing so XState transient nodes (`always` + ordered `cond`)
map to a Fizz helper instead of imperative `if`/early-return inside `Enter`. Composes with existing `state(...)`.

## Locked decisions

- A fluent, **immutable** builder `route()` is used (not a variadic `always(cond(...))`), matching the
  existing `switch_` fluent precedent and the repository's functional ethos. Each `.when`/`.otherwise`
  returns a **new** builder.
- The builder value **is** a state handler `(data, payload, utils) => HandlerReturn<Data>`, so it drops
  directly into an `Enter` slot (transient/eventless transition) or any action handler slot (guarded
  transition on an event). No terminator/`.run()` call is required.
- No matching branch and no `otherwise()` returns `undefined`, which **stays put** (no transition).
  It does **not** emit a dev warning and does **not** throw. An empty `route()` always stays.
- Predicates are **synchronous and pure** `(data, payload) => boolean`. First match wins, later predicates
  are not evaluated.
- Breaking changes are allowed but this phase is purely **additive**.

## API to implement

New module: `packages/fizz/src/routing.ts`

- `route<Data = undefined, Payload = undefined>()`: factory returning a `RouteBuilder<Data, Payload>`.
  `Data`/`Payload` are supplied explicitly; the slot placement still type-checks `Payload`.
- `.when(predicate, target, options?)`:
  - `predicate: (data: Data, payload: Payload) => boolean`, or a TS type guard
    `(data: Data, payload: Payload) => data is Narrowed` that narrows `target`'s `data` **locally**
    (it does not accumulate on the builder's `Data` generic).
  - `target: (data, payload, utils) => HandlerReturn<Data>` — full handler parity. A bare `BoundStateFn`
    is accepted automatically (structural: lower-arity fn, called with current data). Targets may be
    async, and may return a transition, effect, action, array combo, or bare `Data` (implicit update).
  - `options?: { label?: string }`.
- `.otherwise(target, options?)`: optional final unconditional branch (same `target`/`options` shapes).
- The builder evaluates branches top-to-bottom, returns the first matching branch's
  `target(data, payload, utils)` verbatim, otherwise returns `undefined` (stay).

## Introspection (light)

- `getRouteMetadata(handler)` returns `{ branches: ReadonlyArray<{ predicate?, label, otherwise }> }`
  in declaration order, or `undefined` for non-route handlers. The metadata symbol is **internal**.
- Label resolution is uniform across `.when` and `.otherwise`: explicit `{ label }` → else `target.name`
  if non-empty → else positional fallback (`branch N`, or `otherwise` for the default branch). Targets are
  **not** invoked to derive a name.

## Files

- CREATE `packages/fizz/src/routing.ts`
- EDIT `packages/fizz/src/index.ts` — add sorted exports (follow existing sorted-exports lint rule,
  `.js` suffixes): types `RouteBranch`, `RouteBranchOptions`, `RouteBuilder`, `RouteMetadata`,
  `RouteTarget`; values `getRouteMetadata`, `route`.
- CREATE `packages/fizz/src/__tests__/routing.spec.ts`

## Reference patterns to reuse

- `state(...)` signature + `StateHandlers` / `HandlerReturn<Data>` / `StateReturn` in `packages/fizz/src/state.ts`.
- `BoundStateFn` and `StateTransition` shapes in `packages/fizz/src/state.ts`.
- `switch_(...)` Matcher in `packages/fizz/src/state.ts` as a style reference (do **not** extend it; a new module is cleaner).
- `enter()` = `action("Enter")` from `packages/fizz/src/action.ts`.

## Tests (red/green TDD — write failing first)

In `routing.spec.ts`, behavior-focused descriptions:

1. ordered fallthrough: first matching `.when` wins, later predicates not evaluated (short-circuit).
2. `.otherwise` used when no `.when` matches.
3. no match + no `.otherwise` (and empty `route()`) => returns `undefined` (stays put).
4. target returning an array runs actions/effects then transitions.
5. target as `(data) => transition` receives current data; bare `BoundStateFn` transitions with current data.
6. target returning bare `Data` performs an implicit update; async target passes through.
7. type-guard predicate narrows the target's `data` locally.
8. runtime integration: transient `Enter` route, and a guarded action route reading `payload`.
9. introspection: `getRouteMetadata` returns ordered labels (explicit/`target.name`/positional);
   returns `undefined` for non-route handlers; builders are immutable (base branches unaffected).

## Verification (report exact commands + outcomes)

- `npm run test --workspace @tdreyno/fizz -- routing`
- `npm run typecheck --workspace @tdreyno/fizz`
- `npm run lint --workspace @tdreyno/fizz -- src/routing.ts src/__tests__/routing.spec.ts src/index.ts`
- `npm exec -- prettier --write packages/fizz/src/routing.ts packages/fizz/src/__tests__/routing.spec.ts packages/fizz/src/index.ts`
- Sonar: toggle automatic analysis OFF at start; at end run `analyze_file_list` on edited files, then toggle analysis ON.

## Scope boundaries

- IN: `route()` builder (`.when`/`.otherwise`) + `getRouteMetadata` + tests + exports + light metadata.
- OUT: visualizer rendering, full migration guide (Phase 4), nested-path interplay (Phase 2),
  async predicates (predicates stay synchronous), compile-time exhaustiveness checking.

## Done when

All routing specs green; typecheck/lint/prettier clean; exports sorted; no changes outside listed files.
