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

When answering API questions, prefer the exported surface over internal implementation details.

## Mental Model

A Fizz machine is built from these pieces:

- actions: named events with optional payloads
- states: handler maps keyed by action name
- effects: explicit side-effect descriptions returned from handlers
- runtime: the orchestrator that processes actions, transitions, and effects over time
- context: runtime state history and metadata

Fizz works best when handlers are easy to read and each accepted action has a clear outcome.

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

## State Utils

Fizz state handlers receive a utilities object from `state.ts`. Important helpers include:

- `update(data)` to stay in the same state with new state data
- `trigger(action)` when the runtime must receive a follow-up action
- `startAsync(...)` and `cancelAsync(...)`
- `startTimer(...)`, `cancelTimer(...)`, `restartTimer(...)`
- `startInterval(...)`, `cancelInterval(...)`, `restartInterval(...)`
- `startFrame()` and `cancelFrame()`
- `resources` for state-scoped resource access

### State Resources

Fizz supports state-scoped resources that are independent from state data updates:

- `resource(key, value, teardown?)`
- `abortController(key)`
- `subscription(key, subscribe)`

Lifecycle behavior:

- resources are available through handler `utils.resources`
- resources are preserved across same-state `update(...)` transitions
- resources are released automatically on state exit
- resource release does not trigger context change events

Runtime monitor events include resource lifecycle signals:

- `resource-registered`
- `resource-released`
- `resource-release-failed`

Use these helpers instead of manually reproducing runtime behavior.

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
- `historyBack()`
- `historyForward()`
- `historyGo(delta)`
- `postMessage(message, targetOrigin, transfer?)`

Modeling guidance:

- treat `confirm(...)` and `prompt(...)` as persistent runtime-owned request/response primitives
- they resolve into built-in actions: `ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, `PromptCancelled`
- these pending requests remain active across normal machine state transitions
- one-way browser helpers (`alert`, copy, open, print, navigation, postMessage) are fire-and-forget and do not emit follow-up actions

Driver guidance:

- runtime creation accepts `browserDriver`
- the built-in browser implementation is exported from `@tdreyno/fizz/browser` as `browserDriver`

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

If you want a declarative machine container first, build it with `createMachine(...)` and then create the runtime from the machine.

This matters because the first `enter()` automatically performs Fizz's pre-entry bootstrap before any `Enter` handlers run.

## Effects

Effects are explicit objects, not implicit side effects. The `Effect` class and helpers in `effect.ts` are how Fizz expresses work that should happen outside pure transition logic.

Use explicit effects when the machine needs to:

- log or warn
- emit output actions
- schedule async or timed work
- represent a no-op intentionally

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
