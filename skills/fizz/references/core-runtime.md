# Core Runtime

Use this reference when the task is about modeling a Fizz machine, wiring a runtime, or reviewing how actions, effects, and transitions fit together.

## Export Surface

The main Fizz package exports its public surface from `packages/fizz/src/index.ts`:

- action helpers from `action.ts`
- machine definition helpers from `createMachine.ts`
- context helpers from `context.ts`
- effect helpers from `effect.ts`
- runtime helpers from `runtime.ts`
- state helpers from `state.ts`
- selector helpers from `selectors.ts`
- parallel composition helpers from `parallelMachine.ts`
- external store wiring from `connectExternalSnapshot.ts`

When answering API questions, prefer the exported surface over internal implementation details.

## Mental Model

A Fizz machine is built from these pieces:

- actions: named events with optional payloads
- states: handler maps keyed by action name
- effects: explicit side-effect descriptions returned from handlers
- runtime: the orchestrator that processes actions, transitions, and effects over time
- context: runtime state history and metadata

Fizz works best when handlers are easy to read and each accepted action has a clear outcome.

For output map aliases, command-channel emission APIs, and runtime output channel subscriptions, continue with `output-actions.md`.

For wiring an external store (Redux, Zustand, custom observable) into the runtime action stream with built-in distinct-until-changed and loop guard, use `connectExternalSnapshot` — continue with `store-sync-adapter.md`.

## State Design

### `state(...)`

Use `state(...)` for a normal state definition. A handler can return:

- a next state transition
- an action
- an effect
- a list of state returns

In practice, keep each handler focused on one concern:

- update machine data
- move to another state
- schedule follow-up work
- emit output actions

### `stateWithNested(...)`

Use `stateWithNested(...)` only when the machine genuinely benefits from nested composition. Do not introduce nesting just to avoid a couple of repeated handlers.

Nested state composition should make the machine easier to reason about, not harder.

### `createParallelMachine(...)`

Use `createParallelMachine(...)` when several child workflows should stay active together and the parent should broadcast shared actions to every branch that can handle them.

Each branch must provide:

- a machine root returned from `createMachine(...)`
- that machine root's `initialState`

If the same machine shape needs different start values per branch, use `.withInitialState(...)` on the machine root before passing it to `createParallelMachine(...)`.

This keeps parallel composition inside the normal runtime model instead of introducing a separate orchestration layer.

If the task is primarily about parallel composition design, branch lifecycle, or `getParallelRuntimes(...)`, continue with `parallel-state-machines.md`.

### `getParallelRuntimes(...)`

Use `getParallelRuntimes(...)` to read the keyed child runtime map from a parallel machine state's data.

This is the preferred public helper for integrations that need branch inspection. Avoid reaching into the internal symbol directly.

### Matchers and state helpers

Fizz also exports helpers that keep state logic explicit and testable:

- `switch_(...)` to branch on the current state transition
- `whichTimeout(...)` to exhaustively handle timeout ids
- `whichInterval(...)` to exhaustively handle interval ids
- `waitState(...)` to model request-on-enter and response-driven transitions
- `isStateTransition(...)` as a type guard when handling mixed values

Prefer these helpers when they make branching clearer than ad-hoc conditionals.

### Selectors

Use `selectWhen(...)` to define read-only derived checks colocated with `createMachine(...)` roots.

Selector inputs and behavior:

- `when`: a state creator or readonly list of state creators
- second argument: either a selector function with shape `(data, state, context) => result` or a matcher object shorthand
- optional final `options` object: `{ equalityFn? }`
- function selectors return `undefined` when non-matching
- matcher-object selectors return `true` when all matcher keys equal `state.data` values, otherwise `false`

Selectors keep repeated `currentState.is(...)` branches out of component render code and make derivations discoverable on machine roots.

For complex nested matching, discriminated unions, or array/primitive matching, prefer `ts-pattern` and pass `isMatching(...)` directly to `selectWhen(...)`.

For non-React usage, evaluate selector definitions directly with `runStateSelector(selector, currentState, context)`.

When imperative adapter code needs to dispatch and immediately read from the resulting state, use `runtime.runAndSelect(action, selectorOrProject)`. Prefer the selector form for reusable reads and the projection form only for narrow one-off adapter logic.

`runAndSelect(...)` resolves after the same synchronous transition/effect boundary as `runtime.run(...)`. It does not wait for async effect settlement.

## State Utils

Fizz state handlers receive a utilities object from `state.ts`. Important helpers include:

- `update(data)` to stay in the same state with new state data
- `trigger(action)` when the runtime must receive a follow-up action
- `startAsync(...)` and `cancelAsync(...)`
- `startTimer(...)`, `cancelTimer(...)`, `restartTimer(...)`
- `startInterval(...)`, `cancelInterval(...)`, `restartInterval(...)`
- `startFrame()` (one-shot), `startFrameLoop()` (continuous loop), and `cancelFrame()`
- `resources` for state-scoped resource access

### State Resources

State resources and fluent resource-event bridging are documented in detail in `references/resources.md`.

Use that reference for helper signatures, lifecycle rules, bridge behavior, and usage examples.

## Browser Driver Effects

Fizz now includes built-in browser-oriented effect helpers and runtime driver support.

Browser effect helpers include:

- `confirm(message)`
- `prompt(message)`
- `alert(message)`
- `copyToClipboard(text)`
- `openUrl(url, target?, features?)`
- `printPage()`
- `locationAssign(url)`
- `locationReplace(url)`
- `locationReload()`
- `locationSetHash(hash)`
- `locationSetHref(href)`
- `locationSetHost(host)`
- `locationSetHostname(hostname)`
- `locationSetPathname(pathname)`
- `locationSetPort(port)`
- `locationSetProtocol(protocol)`
- `locationSetSearch(search)`
- `historyBack()`
- `historyForward()`
- `historyGo(delta)`
- `historyPushState(state, url?)`
- `historyReplaceState(state, url?)`
- `historySetScrollRestoration(value)`
- `postMessage(message, targetOrigin, transfer?)`

`dom.mutate(fn)` is available for imperative DOM writes that don't fit the resource model. The callback fires synchronously when the effect is dispatched and is scoped to the current state like all browser effects.

Browser DOM singleton builders include:

- `dom.window(resourceId?)`
- `dom.document(resourceId?)`
- `dom.visualViewport(resourceId?)`
- `dom.history(resourceId?)`
- `dom.location(resourceId?)`

Browser singleton guidance:

- `dom.history()` exposes readonly snapshots (`length`, `scrollRestoration`, `state`) and supports `listen("popstate", ...)`
- `dom.location()` exposes readonly URL fields (`hash`, `host`, `hostname`, `href`, `origin`, `pathname`, `port`, `protocol`, `search`) and supports `listen("hashchange", ...)`
- browser DOM builders are resource effects directly, so `dom.history()` and `dom.location()` can be returned from handlers without `.resource()`
- both behave as live runtime-backed resources; reads should happen inside handlers/selectors instead of being copied at machine creation time
- use effects for mutations (`historyPushState`, `historyReplaceState`, `historySetScrollRestoration`, `locationSet*`) and resources for reads/listening

Modeling guidance:

- treat `confirm(...)` and `prompt(...)` as persistent runtime-owned request/response primitives
- they resolve into built-in actions: `ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, `PromptCancelled`
- these pending requests remain active across normal machine state transitions
- one-way browser helpers (`alert`, copy, open, print, navigation, postMessage) are fire-and-forget and do not emit follow-up actions

Driver guidance:

- runtime creation accepts `browserDriver`
- import browser runtime drivers from `@tdreyno/fizz/browser`
- `browserDriver` and `domDriver` are not exported from root `@tdreyno/fizz`

## Runtime Boot Sequence

When building a runtime manually, follow the same lifecycle used by the public examples and React hook:

```typescript
import { createInitialContext, createRuntime, enter } from "@tdreyno/fizz"

const context = createInitialContext([InitialState(initialData)])
const runtime = createRuntime(context, actions, outputActions)

await runtime.run(enter())
```

Machine-first runtime creation with browser support:

```typescript
import { createRuntime, enter } from "@tdreyno/fizz"
import { browserDriver } from "@tdreyno/fizz/browser"

const runtime = createRuntime(machine, machine.states.Ready(initialData), {
  browserDriver,
})

await runtime.run(enter())
```

For one-shot imperative reads after a dispatch:

```typescript
const nextRenderInputs = await runtime.runAndSelect(
  actions.localChanged({ value: "draft" }),
  machine.selectors.renderInputs,
)
```

Runtime teardown diagnostics:

```typescript
const snapshot = runtime.getDiagnosticsSnapshot()

runtime.assertCleanTeardown()

runtime.assertCleanTeardown({
  allow: {
    timers: true,
  },
})
```

`getDiagnosticsSnapshot()` returns active runtime diagnostics grouped by:

- `listeners`: normalized listener counts by target/type
- `resources`: active state resources with key/state name
- `timers`: active timeout/interval/frame entries
- `asyncOps`: active async/debounced operation ids
- `channelQueues`: active imperative command queue depth per channel

`assertCleanTeardown()` throws when non-allowed diagnostics groups still contain active entries. Use `allow` for expected exceptions in tests/migrations.

If you want a declarative machine container first, build it with `createMachine(...)` and then create the runtime from the machine.

This matters because the first `enter()` automatically performs Fizz's pre-entry bootstrap before any `Enter` handlers run.

## Runtime Registry

For non-React integrations that need keyed runtime reuse and explicit teardown, use `createRuntimeRegistry(...)`.

```typescript
import { createRuntime, createRuntimeRegistry, enter } from "@tdreyno/fizz"

const registry = createRuntimeRegistry<string | object, Runtime<any, any>>()

const runtime = registry.getOrCreate("notes:1", () => {
  const created = createRuntime(machine, machine.states.Initial())

  void created.run(enter())

  return created
})

registry.dispose("notes:1")
```

Key points:

- `getOrCreate(key, init)` is the required creation path.
- `disposeRuntime` is optional. By default, the registry calls `disconnect()` if it exists on the value.
- `onLifecycleEvent` is optional and can be used for lightweight diagnostics.
- `removeOnFailure` defaults to `true` so failed disposal does not leave stale entries behind.

Use manual lifecycle control (`dispose`, `disposeAll`) in v1. TTL and automatic eviction should stay as follow-up concerns.

## Effects

Effects are explicit objects, not implicit side effects. The `Effect` class and helpers in `effect.ts` are how Fizz expresses work that should happen outside pure transition logic.

Use explicit effects when the machine needs to:

- log or warn
- emit output actions
- dispatch typed imperative adapter commands with `commandEffect(...).chainToAction(...)`
- run ordered imperative command groups with `effectBatch([...], options?)`
- reduce repeated channel wiring with `commandChannel(...).command(...)` and `commandChannel(...).batch(...)`
- schedule async or timed work
- represent a no-op intentionally

`commandChannel(...)` guidance:

- Bind one channel once for local machine ergonomics.
- Use `command(...)` to create channel-scoped command effects.
- Use `batch(...)` to create channel-scoped `effectBatch(...)` calls without repeating `channel` options.
- This is ergonomic sugar over existing APIs, not a runtime behavior change.

`effectBatch(...)` guidance:

- Use it for multi-step adapter sequences that must stay ordered.
- `channel` is optional; when provided, same-channel batches are serialized.
- `onError` defaults to `"failBatch"`; set `"continue"` to process remaining commands after a failure.
- Chain completion/failure with either:
  - `chainToAction(resolveAction, reject?)` for internal machine workflow
  - `chainToOutput(resolveOutputAction, reject?)` for integration-facing notifications

Do not describe handler behavior as “pure” if it directly performs IO inline instead of returning an effect or async helper result.

## Action Wiring

Define action creators once, then pass the runtime action map into `createRuntime(...)`. Keep the runtime map aligned with the actions the machine actually receives.

Prefer named, reusable actions instead of anonymous object literals so types stay precise and tests stay readable.

## Review Heuristics

When reviewing Fizz code, check these first:

- Does each state clearly state which actions it accepts?
- Are transitions explicit and easy to trace?
- Is side-effect work represented through effects or async helpers?
- Is nested state composition justified?
- Should this be a parallel machine instead of a nested child state?
- Is runtime bootstrapping done with `enter()`?

If the task shifts into async work or cancellation semantics, continue with `async-and-scheduling.md`.
