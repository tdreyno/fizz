# React Integration

Use this reference when the task involves `@tdreyno/fizz-react`, React components that host Fizz machines, or questions about `useMachine(...)`.

## Public Surface

`@tdreyno/fizz-react` exports `useMachine(...)` from `packages/fizz-react/src/index.ts`.

The current hook implementation in `packages/fizz-react/src/useMachine.ts`:

- creates the initial context with `createInitialContext(...)`
- creates the runtime with `createRuntime(...)`
- binds actions through `runtime.bindActions(actions)`
- subscribes to runtime context changes with `runtime.onContextChange(...)`
- runs `enter()` in an effect after mount

## What The Hook Returns

The hook returns an object shaped around:

- `currentState`
- `states`
- `context`
- `actions`
- `runtime`

Treat that return value as the bridge between React rendering and the machine runtime.

## Design Guidance

### Keep the machine authoritative

Business workflow belongs in Fizz states and actions. React components should mostly:

- render from `currentState` or `context`
- branch on state identity with `currentState.is(machine.states.SomeState)`
- call bound actions in response to user input
- avoid re-implementing transition logic in local component state

### Keep machine definitions stable

Define states and action creators outside the component body unless the task specifically needs dynamic machine construction. This avoids mixing render concerns with machine architecture.

### Use bound actions from the hook

The hook binds runtime actions for you. Prefer calling the returned `actions` object instead of reaching into the runtime manually from the component.

### Be careful with initialization assumptions

The runtime bootstrap happens in an effect. If the task depends on what happens on entry, reason from that lifecycle rather than assuming the machine is fully entered during render.

## Review Heuristics

When reviewing fizz-react code, check these first:

- Is machine logic living in Fizz states rather than component-local state?
- Are components dispatching through the bound `actions` interface?
- Is the component rendering from machine state instead of duplicating it?
- Does the task require runtime access, or is `currentState` plus `actions` enough?

## When Not To Use This Reference

If the task is really about runtime semantics, effect helpers, or cancellation behavior, switch back to:

- `core-runtime.md`
- `async-and-scheduling.md`
