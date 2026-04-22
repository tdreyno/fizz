---
"@tdreyno/fizz": minor
"@tdreyno/fizz-react": minor
---

# Breaking Change

Replace the React-specific `useParallelMachines(...)` hook with the runtime-first `createParallelMachine(...)` shape and host it through `useMachine(...)`.

`@tdreyno/fizz` now exports `getParallelRuntimes(...)` so React and other integrations can read the keyed child runtime map from the parent parallel machine state.

`createParallelMachine(...)` now accepts a map of `createMachine(...)` results that already carry their own `initialState`, instead of `{ machine, initialState }` branch wrappers.

Created machine roots now expose `.withInitialState(...)` so callers can override startup state with runtime values while reusing the same machine definition, including branch overrides in `createParallelMachine(...)`.

This is a breaking API change in `@tdreyno/fizz-react`: callers should construct the parallel machine in core, pass `parallel.machine` and `parallel.initialState` into `useMachine(...)`, dispatch through `machine.actions`, and read branch runtimes with `getParallelRuntimes(machine.currentState.data)`.
