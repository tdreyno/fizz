# Migrating from XState

If you have an XState v4 codebase, most of what you already know transfers directly to Fizz: you still model explicit states, guarded transitions, async services, and hierarchical "mode with sub-steps" flows. What changes is the _shape_ of the code. XState leans on a declarative config object plus generated types; Fizz leans on plain TypeScript functions with native inference, explicit effects, and built-in async cancellation.

This guide names the XState pattern you are migrating, shows the Fizz equivalent, and walks through one worked example per concept. It is intentionally generic — every example is small and self-contained, so you can map your own machines a piece at a time.

## Why migrate

Three differences tend to motivate the move:

- **No typegen build step.** XState v4 machines usually carry a hand-maintained `*.typegen.ts` file plus `tsTypes` wiring, and often `as`-casts on the `context`/`events`/`services` schemas. Fizz infers handler data and action payloads from ordinary TypeScript, so that entire category of file and ceremony disappears.
- **Effects are explicit.** A side effect hidden inside an XState `entry` action (for example a Redux dispatch) becomes an explicit `effect(...)` or `output(...)` return in Fizz. Effects are values you return from handlers, which makes them easy to test and observe.
- **Async is first-class.** Promise `invoke` plus `onDone`/`onError` maps onto Fizz's async builders with `.chainToAction(...)`, and you get built-in cancellation, stale-completion handling, and full teardown through `disconnect()` — none of which XState v4 gives you for free.

## Concept mapping

| XState concept                                                 | Fizz equivalent                                                                                   | Notes                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `createMachine(config, options)` declarative config            | `createMachine({ states, actions })` handler-map builder                                          | Different shape; states are functions                 |
| `tsTypes` + generated `*.typegen.ts`                           | native TypeScript inference                                                                       | no codegen step                                       |
| `assign(...)` actions                                          | `update(...)` or returning a data object                                                          | implicit update from a handler                        |
| `entry` / `exit` actions                                       | `Enter` handler / state exit handler                                                              | see [Architecture](./architecture.md)                 |
| `final` state                                                  | terminal state with no handlers                                                                   | nothing to transition to                              |
| Promise `invoke` + `onDone`/`onError`                          | `customJSONAsync(...)`/`startAsync(...)` + `.chainToAction(resolve, reject)`, or `waitState(...)` | built-in cancel/stale handling                        |
| `onError` branch by error code                                 | `reject` handler + `matchOn(...)`                                                                 | classifier must return a present key (no default)     |
| `cond` guards                                                  | functions in handlers, `switch_(...)`, or `route()`                                               | explicit, not config                                  |
| eventless transient (`always`) with ordered `cond` fallthrough | `route().when(...).otherwise(...)` in an `Enter` slot                                             | first match wins                                      |
| side-effecting actions                                         | explicit `effect(...)` / `output(...)`                                                            | returned from handlers                                |
| compound nesting with deep `#id.a.b` targets                   | `stateWithNested(...)` + child-entry resolver                                                     | no deep string targets; use mode + sub-step           |
| `state.toStrings()` dotted path                                | `getStatePath(...)` / `runtime.currentStatePath(...)`                                             | composes nested regions                               |
| `interpret(...)` imperative driver                             | `createRuntime(...)` + `run(enter())`                                                             | see [Architecture](./architecture.md)                 |
| `interpreter.onTransition(...)`                                | `runtime.onTransition(...)`                                                                       | fires on state-name change with the triggering action |
| `state.event` from an observer                                 | `onTransition(...)` `action` field / `runtime.lastAction()`                                       | the action that caused the transition                 |
| transition history / flow string                               | `runtime.getVisitedStateNames()` / `getFlow()`                                                    | derived from history                                  |
| await reaching a final state                                   | `runtime.runUntil(...)` / `waitUntilState(...)` + `matchState`/`matchAny`                         | see [Awaiting Conditions](./awaiting-conditions.md)   |
| `createActorContext` + `useActor`/`useSelector`                | `createMachineContext(...)` + `machine.selectors` / `useSelector`                                 | see [React Integration](./react-integration.md)       |
| `EmittedFrom<typeof machine>` selector typing                  | inferred selector signatures                                                                      | no helper type needed                                 |
| parallel / history / `spawn` / `after` / activities            | `createParallelMachine(...)` (parallel only); others differ                                       | see "What Fizz models differently" below              |

## Worked recipes

### Transient `always` transitions become `route()`

A common XState pattern is a _decision node_: a state whose only job is to evaluate ordered conditions on entry and route somewhere. XState expresses this with `always` plus ordered `cond` fallthrough:

```ts
// XState
boot: {
  always: [
    { target: "disabled", cond: ctx => !ctx.webPushCapable },
    { target: "continue", cond: ctx => ctx.hookEnabled },
    { target: "checkStoredRegistration" },
  ]
}
```

In Fizz, `route()` builds the same ordered-guard handler and drops straight into the `Enter` slot. The first matching predicate wins; `.otherwise(...)` is the optional default. When nothing matches and there is no `otherwise`, the machine stays put.

```ts
import { route, state } from "@tdreyno/fizz"

type BootData = { webPushCapable: boolean; hookEnabled: boolean }

const bootRoute = route<BootData>()
  .when(data => !data.webPushCapable, Disabled)
  .when(data => data.hookEnabled, Continue)
  .otherwise(CheckStoredRegistration)

const Boot = state<Enter, BootData>({ Enter: bootRoute })
```

Because the route value is itself a handler, you can also use it in an action slot for a guarded transition on an event, not just on entry. Tooling can inspect the ordered branches with `getRouteMetadata(...)`. See [`route`](./api.md#route) for the full surface.

### Promise `invoke` becomes an async builder with `.chainToAction(...)`

XState models async work as an invoked service with `onDone`/`onError`:

```ts
// XState
loading: {
  invoke: {
    src: "loadProfile",
    onDone: { target: "ready", actions: assign({ profile: (_, e) => e.data }) },
    onError: "failed",
  }
}
```

In Fizz, return an async builder from the state's `Enter` handler and map the settled result back into actions with `.chainToAction(resolve, reject)`. Use `customJSONAsync(...)` when your app client already returns parsed values, or `startAsync(...)` for a raw promise. Both `resolve` and `reject` are required when chaining.

```ts
import { customJSONAsync, state } from "@tdreyno/fizz"

const Loading = state<Enter, LoadingData>({
  Enter: () =>
    customJSONAsync(() => api.loadProfile(), "profile").chainToAction(
      profile => profileLoaded(profile),
      reason => profileFailed(String(reason)),
    ),
})
```

Fizz fires the abort signal for in-flight async work on `disconnect()` and discards stale completions automatically. See [Async](./async.md) for cancellation, debouncing, and the full builder surface.

If you prefer a request-on-enter / response-driven shape, `waitState(...)` models the same flow declaratively. See [`waitState`](./api.md#waitstate) in the API reference.

### `onError` branch-by-code becomes `matchOn(...)`

XState codebases often branch the `onError` path on an error code read from `event.data`, producing a parallel set of guarded `onError` entries. In Fizz, the `reject` handler receives the error, and `matchOn(...)` keeps the case handling exhaustive and reusable when the resolved payload is a discriminated union:

```ts
import { customJSONAsync, matchOn, state } from "@tdreyno/fizz"

const Subscribing = state<Enter, SubscribeData>({
  Enter: () =>
    customJSONAsync(() => pushService.subscribe(), "subscribe").chainToAction(
      matchOn(result => result.kind, {
        associated: result => subscribed(result.id),
        denied: () => permissionDenied(),
        unsupported: () => pushUnsupported(),
      }),
      error => subscribeFailed(String(error)),
    ),
})
```

`matchOn(...)` has **no** default/fallback case — the classifier must return a key that exists in the cases map. This is intentional: it forces you to enumerate every outcome rather than silently falling through. `matchOn(...)` returns a standard resolve handler, so it works anywhere `chainToAction(resolve, reject)` is accepted.

### Side-effecting actions become explicit effects

An XState `entry` action that performs a side effect (for example dispatching to Redux) is hidden control flow. In Fizz, return the effect from the handler so it is a visible value:

```ts
import { effect, state } from "@tdreyno/fizz"

const persist = effect("persist", undefined, () => {
  store.dispatch(saveMailboxAttribute())
})

const WritingConfig = state<Enter, ConfigData>({
  Enter: data => [persist, Complete(data)],
})
```

For values you want consumers to observe instead of fire-and-forget side effects, return an `output(...)` action and subscribe with `onOutput(...)`. See [Custom Effects](./custom-effects.md) and [Output Actions](./output-actions.md).

### Hierarchical "mode + sub-step" becomes `stateWithNested(...)`

XState compound states model a mode (`enabled`) that contains sub-steps (`writeConfig` → `fallback` → `complete`), often targeted with deep ids like `#machine.enabled.complete`. Fizz expresses the same shape with `stateWithNested(...)`: a parent state that is one coherent mode, hosting its own child region. Instead of deep string targets, the parent picks the child's starting leaf with a resolver function over its own data.

```ts
import { state, stateWithNested } from "@tdreyno/fizz"

const Enabled = stateWithNested(
  { Disable: data => Disabled(data) },
  // Resolve which child leaf to start in from the parent's data.
  data => (data.hasStoredConfig ? Complete(data) : WriteConfig(data)),
  { disable },
  { name: "Enabled" },
)
```

For logging and analytics that previously relied on `state.toStrings()`, `getStatePath(...)` composes a hierarchical path string across nested regions (default separator `/`), and `runtime.currentStatePath(options?)` does the same for the live runtime:

```ts
import { getStatePath } from "@tdreyno/fizz"

getStatePath(runtime) // "Enabled/WriteConfig"
runtime.currentStatePath({ separator: "." }) // "Enabled.WriteConfig"
```

See [Nested State Machines](./nested-state-machines.md) for the full pattern, including how child handlers read parent resources.

### `interpret(...)` becomes `createRuntime(...)` + run-to-completion

For machines driven imperatively (outside React), XState uses `interpret(...)`, subscribes for history, and resolves a promise when the machine reaches a final state. Fizz uses `createRuntime(...)`, dispatches with `run(enter())`, and awaits a terminal state with `waitUntilState(...)` or `runUntil(...)`.

For a single terminal state:

```ts
import { createRuntime, enter, matchState } from "@tdreyno/fizz"

const runtime = createRuntime(machine, machine.states.Subscribing())
const done = await runtime.runUntil(
  enter(),
  matchState(machine.states.Subscribed),
)
```

When a run can settle at one of several terminal states, use `matchAny(...)` with a predicate over the event:

```ts
import { matchAny } from "@tdreyno/fizz"

await runtime.run(enter())

const settled = await runtime.waitUntil(
  matchAny(event =>
    event.kind === "state" &&
    (event.state.is(machine.states.Subscribed) ||
      event.state.is(machine.states.Failed))
      ? "settled"
      : undefined,
  ),
)
```

See [Awaiting Conditions](./awaiting-conditions.md) for `matchState`, `matchAny`, and the timeout options.

### Transition logging and flow telemetry

XState codebases often build a generic transition logger from `interpreter.onTransition(...)`, joining `state.toStrings()` into a flow string and reading `state.event.data` for the triggering payload. Fizz exposes these directly on the runtime.

`onTransition(...)` fires only when the state name changes and hands you the triggering action:

```ts
const unsubscribe = runtime.onTransition(({ state, previousState, action }) => {
  analytics.track("transition", {
    from: previousState?.name,
    to: state.name,
    via: action?.type,
  })
})
```

After (or during) a run, read the path the machine took:

```ts
runtime.getVisitedStateNames() // ["Idle", "Subscribing", "Subscribed"] — oldest first
runtime.getFlow() // "Idle,Subscribing,Subscribed"
runtime.getFlow(" -> ") // custom separator
runtime.lastAction()?.type // the most recent triggering action
```

`getVisitedStateNames(...)` accepts the same path options as `getStatePath(...)`, so nested runs produce composed names. See [`onTransition`](./api.md#ontransition) and the runtime method list in the [API reference](./api.md#context-and-runtime).

### React: `createActorContext` becomes `createMachineContext`

XState's `@xstate/react` shares a machine across a subtree with `createActorContext`, then consumes it with `useActor` (for `send`) and `useSelector` (for reads). Fizz mirrors this with `createMachineContext(...)`, which returns a typed `Provider` and consumer hook:

```tsx
import { createMachineContext } from "@tdreyno/fizz-react"

const { Provider, useMachineContext } = createMachineContext(CounterMachine)

const Toolbar = () => {
  const machine = useMachineContext()
  return <button onClick={() => machine.actions.increment()}>+</button>
}
```

For a single component-local machine, use `useMachine(machine, initialState)` directly. Read derived values from `machine.selectors` (defined on the machine with `selectWhen(...)`), and for render-critical paths set `disableAutoSelectors: true` and read with `useSelector(...)`. To replace a generic transition observer, use `useTransition(...)`, which delivers `{ state, previousState, action, context }` and fires only on state-name changes:

```tsx
import { useMachine, useTransition } from "@tdreyno/fizz-react"

const machine = useMachine(OrderMachine, OrderMachine.states.Cart())

useTransition(machine, ({ state, previousState, action }) => {
  analytics.track("order_transition", {
    from: previousState?.name,
    to: state.name,
    via: action?.type,
  })
})
```

`connectExternalSnapshot(...)` and `selectWhen(...)` live in `@tdreyno/fizz` (the core package), not in `@tdreyno/fizz-react`. See [React Integration](./react-integration.md) for the full hook surface and the store-bridge pattern.

## What Fizz models differently

A few XState capabilities do not map one-to-one. None of these block a typical product migration, but it helps to know the boundaries up front:

- **Parallel regions** use `createParallelMachine(...)`, which keeps several child branches alive together and fans shared actions across them. See [Parallel State Machines](./parallel-state-machines.md).
- **No `spawn` / actor model.** Fizz has no child-actor spawning with bidirectional `send`/`receive`. Model long-lived concurrent work with parallel machines or explicit async, not actors.
- **No deep `#id.a.b` targeting.** Instead of targeting an arbitrary nested leaf by path, model the parent as a mode and pick the child's starting leaf with a `stateWithNested(...)` resolver. Compose human-readable paths with `getStatePath(...)`.
- **Guards are explicit.** There is no separate `guards` config map. A guard is a function you call in a handler, a `switch_(...)`, or a `route()` predicate.
- **History states / `after` delayed transitions** differ. For time-based transitions, use Fizz timers and intervals; see [Timers](./timers.md) and [Intervals](./intervals.md).

## What to read next

- [Getting Started](./getting-started.md) — build your first Fizz machine end to end.
- [Architecture](./architecture.md) — handler returns, effects vs. outputs, and lifecycle ordering.
- [Async](./async.md) — promise services, cancellation, and `matchOn(...)`.
- [Nested State Machines](./nested-state-machines.md) — the mode + sub-step pattern in depth.
- [React Integration](./react-integration.md) — `useMachine`, `createMachineContext`, selectors, and `useTransition`.
- [Awaiting Conditions](./awaiting-conditions.md) — run-to-completion and matchers.
