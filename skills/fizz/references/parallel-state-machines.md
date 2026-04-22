# Parallel State Machines

Use this reference when the task involves `createParallelMachine(...)`, shared actions broadcast across multiple branches, or inspecting child runtimes owned by one parent machine.

## Public Surface

Parallel composition in Fizz is exposed through:

- `createParallelMachine(...)`
- `getParallelRuntimes(...)`
- machine roots created with `createMachine(...)`
- per-branch overrides with `.withInitialState(...)`

The exported surface comes from `packages/fizz/src/index.ts`. Prefer these public helpers over internal runtime details.

## When To Use Parallel Composition

Use `createParallelMachine(...)` when:

- several workflows should stay active at the same time
- one dispatched action should fan out to every branch that can handle it
- each branch should keep its own current state and state data
- the parent should still participate in normal Fizz runtime, debugger, and monitor flows

Typical fits include layouts where sidebar, editor, inspector, presence, or selection workflows all stay alive together.

Do not use a parallel machine just to avoid a few repeated handlers. If one parent mode owns one temporary child workflow that should disappear when the parent changes, that is usually a nested machine instead.

## Shape Of `createParallelMachine(...)`

`createParallelMachine(...)` takes a keyed object of machine roots created with `createMachine(...)`.

Each branch needs its own initial state. If multiple branches reuse the same machine shape but should start differently, use `.withInitialState(...)` before passing the machine root into the parallel machine.

```typescript
import {
  action,
  createMachine,
  createParallelMachine,
  createRuntime,
  enter,
  state,
} from "@tdreyno/fizz"

const refresh = action("Refresh")

const LeftIdle = state({
  Enter: () => undefined,
  Refresh: () => LeftReady(),
})

const LeftReady = state({
  Enter: () => undefined,
})

const LeftMachine = createMachine({
  actions: { refresh },
  initialState: LeftIdle(),
  states: { LeftIdle, LeftReady },
})

const RightIdle = state({
  Enter: () => undefined,
  Refresh: () => RightReady(),
})

const RightReady = state({
  Enter: () => undefined,
})

const RightMachine = createMachine({
  actions: { refresh },
  initialState: RightIdle(),
  states: { RightIdle, RightReady },
})

const parallel = createParallelMachine(
  {
    left: LeftMachine.withInitialState(LeftIdle()),
    right: RightMachine.withInitialState(RightReady()),
  },
  { name: "DashboardParallel" },
)

const runtime = createRuntime(parallel.machine, parallel.initialState)

await runtime.run(enter())
await runtime.run(parallel.actions.refresh())
```

That last dispatch is the important behavior: the parent receives one action, then forwards it to each child runtime that can handle that action.

## Mental Model

The parent parallel machine is still a normal Fizz machine. The main difference is that its state data contains a keyed map of child runtimes.

```text
Parallel machine runtime flow

runtime.run(parallel.actions.refresh())
  |
  v
[ParallelRunning.Refresh]
  |
  +--> child runtime: left.run(Refresh)
  |
  +--> child runtime: right.run(Refresh)
  |
  v
parent state updates with latest child runtime states
```

This means normal Fizz expectations still apply:

- the parent is still created with `createMachine(...)`
- the parent still runs through `createRuntime(...)`
- entry still starts with `enter()`
- actions still go through `runtime.run(...)`
- debugger and monitor flows still operate through the same runtime pipeline

## Branch Lifecycle

Treat each branch as independently stateful, but parent-owned.

- all branch runtimes are created when the parallel parent initializes
- the parent broadcasts a shared action to branches that can accept it
- each branch advances according to its own handlers and data
- the parent stores the updated branch runtimes back into its own state data

Design branches so they can react independently to the same shared action. If every branch must coordinate tightly around ordered parent logic, a flat machine or nested machine may be clearer.

## Inspecting Child Runtimes

Use `getParallelRuntimes(...)` when a task needs to inspect branch runtime state from the parent machine state.

Prefer that helper over reaching into internal symbols or implementation details.

Typical uses:

- assertions in tests
- debugger or monitor integrations
- UI adapters that need to read a branch's current state

If the task only needs branch transitions to happen, do not add inspection code unnecessarily.

## Parallel Vs Nested Machines

Use a nested machine when:

- one parent state owns one smaller child workflow
- the child should only exist while that parent state is active
- forwarding from parent to child should stay explicit through nested-machine APIs

Use a parallel machine when:

- several branches should remain active together
- one action should broadcast to all matching branches
- branch lifecycles should start together under one parent container

The question to ask is whether the composition is about temporary containment or simultaneous activity.

## Design Guidance

### Keep branches independent

Each branch should have a clear purpose and local state transitions. If one branch constantly needs to inspect sibling internals, the decomposition may be wrong.

### Share actions intentionally

Broadcast actions are useful, but overusing them can make control flow harder to trace. Prefer explicit, named actions whose fan-out behavior is easy to explain.

### Reuse machine shapes with care

If two branches use the same machine definition but start from different states, use `.withInitialState(...)` at the branch boundary instead of mutating the machine shape.

### Keep parent logic thin

The parent parallel machine should mostly own composition and broadcasting. Business behavior still belongs inside the branch machines.

## Review Heuristics

When reviewing parallel-machine code, check these first:

- Is this truly simultaneous composition, or should it be nested state instead?
- Are branch responsibilities clearly separated?
- Are shared actions named well enough that broadcast behavior is obvious?
- Is `.withInitialState(...)` used when one machine shape is reused across branches?
- Is branch inspection going through `getParallelRuntimes(...)` instead of internals?
- Does runtime setup still follow the normal `createRuntime(...)` plus `enter()` flow?

## Related References

- `core-runtime.md` for general machine and runtime guidance
- `examples.md` for a shorter copyable example
- `async-and-scheduling.md` when a branch manages async work, timers, or intervals
- `react-integration.md` when a parallel machine is hosted through `useMachine(...)`
