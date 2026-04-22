# Choosing The Right Scale

Fizz is designed as a spectrum, not a single application shape.

Start with a small component-local machine when the workflow is isolated, then move to orchestration patterns only when complexity actually appears.

## The spectrum

Use this quick map to choose a starting point.

| Use case shape                         | Recommended pattern                                    | Why                                                                       |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| One component, a few explicit modes    | `useMachine(...)` with one machine root                | Keeps transitions explicit without global architecture overhead           |
| Multi-step flow in one feature         | One machine with clearer states and scheduling helpers | Centralizes async and timer logic that otherwise spreads across callbacks |
| Parent flow with distinct subflows     | Nested state machines                                  | Keeps parent transitions clear while encapsulating sub-workflows          |
| Several active workflows at once       | Parallel state machines                                | Lets each workflow progress independently under one parent machine        |
| Shared workflow across many components | `createMachineContext(...)`                            | One runtime instance for a subtree with consistent state and actions      |

## A local-first default

For most UI features, start with one component-local machine:

1. Define explicit states and actions.
2. Keep workflow transitions in handlers.
3. Render from `machine.currentState`.
4. Dispatch through `machine.actions`.

If that remains readable, stay there.

## Signals to scale up

Consider orchestration patterns when one or more of these appears:

- duplicated transition logic across multiple components
- async coordination across several views or widgets
- timer, interval, or retry behavior spanning multiple flows
- one parent process coordinating multiple active child workflows

At that point, keep the same mental model and move up in structure:

- use [Nested State Machines](./nested-state-machines.md) for parent and child workflow boundaries
- use [Parallel State Machines](./parallel-state-machines.md) for simultaneous active branches
- use [React Integration](./react-integration.md) context when multiple components need one runtime

## Keep orchestration intentional

Fizz supports complex orchestration, but complexity is optional.

Choose the smallest structure that keeps transitions explicit and behavior easy to reason about.

## Related Docs

- [Getting Started](./getting-started.md)
- [React Integration](./react-integration.md)
- [Nested State Machines](./nested-state-machines.md)
- [Parallel State Machines](./parallel-state-machines.md)
- [FAQ](./faq.md)
