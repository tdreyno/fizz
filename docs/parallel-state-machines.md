# Parallel State Machines

Parallel state machines let one machine host multiple child machines that can respond to the same action independently.

Use `createParallelMachine(...)` when you have multiple active workflows at the same time and they should all stay alive together. A good example is a screen with separate sidebar, editor, and inspector workflows where one action may affect one, some, or all branches.

If one parent mode owns a smaller temporary workflow that should disappear when the parent changes, use [Nested State Machines](./nested-state-machines.md) instead.

## When parallel helps

Reach for a parallel machine when:

- multiple workflows are active at the same time
- one dispatched action should fan out to every branch that can handle it
- each branch should keep its own current state and data
- you want to reuse normal `createMachine(...)`, `createRuntime(...)`, `runtime.run(...)`, and debugger flows

## The shape of `createParallelMachine(...)`

`createParallelMachine(...)` takes a map of labels to machine roots created with `createMachine(...)`.

Each machine root should carry its own `initialState`. You can override that per usage with `.withInitialState(...)`.

```typescript
import {
  action,
  createMachine,
  createParallelMachine,
  createRuntime,
  enter,
  state,
} from "@tdreyno/fizz"

const world = action("World")

const ReadyA = state(
  {
    Enter: () => undefined,
  },
  { name: "ReadyA" },
)

const InitA = state(
  {
    Enter: () => undefined,
    World: () => ReadyA(),
  },
  { name: "InitA" },
)

const BranchA = createMachine({
  actions: { world },
  initialState: InitA(),
  states: { InitA, ReadyA },
})

const ReadyB = state(
  {
    Enter: () => undefined,
  },
  { name: "ReadyB" },
)

const InitB = state(
  {
    Enter: () => undefined,
    World: () => ReadyB(),
  },
  { name: "InitB" },
)

const BranchB = createMachine({
  actions: { world },
  initialState: InitB(),
  states: { InitB, ReadyB },
})

const parallel = createParallelMachine(
  {
    left: BranchA.withInitialState(InitA()),
    right: BranchB.withInitialState(InitB()),
  },
  { name: "ParallelExample" },
)

const runtime = createRuntime(parallel.machine, parallel.initialState)

await runtime.run(enter())
await runtime.run(parallel.actions.world())
```

That last line is the important part: one dispatch against the parent parallel machine fans the action out to each child runtime that can handle it.

## Mental model

The parent machine is still a normal Fizz machine. It just owns a map of child runtimes in its current state's data.

```text
Parallel machine runtime flow

runtime.run(parallel.actions.world())
  |
  v
[ParallelRunning.World]
  |
  +--> child runtime: left.run(World)
  |
  +--> child runtime: right.run(World)
  |
  v
parent state updates with latest child runtime states
```

This keeps the feature inside normal Fizz concepts:

- the parent is still built with `createMachine(...)`
- the parent still runs through `createRuntime(...)`
- actions still go through `runtime.run(...)`
- debug and monitor behavior still comes from the existing runtime pipeline

## How it differs from nested machines

Nested and parallel composition solve different problems.

Use [Nested State Machines](./nested-state-machines.md) when:

- one parent state owns one smaller child workflow
- the child only exists while that parent state is active
- parent-to-child forwarding should stay explicit through `nestedActions`

Use `createParallelMachine(...)` when:

- several child workflows are active together
- the parent should broadcast shared actions to all matching branches
- branch lifecycles should all begin when the parallel parent enters

## Related Docs

- [Architecture](./architecture.md)
- [Nested State Machines](./nested-state-machines.md)
- [API Documentation](./api.md)
