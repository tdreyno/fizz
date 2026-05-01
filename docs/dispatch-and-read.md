# Dispatch And Read

Use this guide when adapter code needs to dispatch an action and immediately read a derived value from the resulting state.

`runtime.runAndSelect(...)` is a small imperative helper from `@tdreyno/fizz`. It keeps the dispatch step and the read step together without changing normal runtime semantics.

## The Problem It Solves

Imperative integrations often have a repeated shape:

1. dispatch an action into the runtime
2. read the resulting state
3. derive adapter inputs from that state

That pattern is fine, but it spreads one logical step across multiple lines and multiple call sites:

```ts
await runtime.run(localChanged({ value: nextValue }))

const renderInputs = runStateSelector(
  machine.selectors.renderInputs,
  runtime.currentState(),
  runtime.context,
)
```

`runAndSelect(...)` keeps that flow in one place:

```ts
const renderInputs = await runtime.runAndSelect(
  localChanged({ value: nextValue }),
  machine.selectors.renderInputs,
)
```

## Mental Model

```text
dispatch action
  -> runtime processes synchronous transitions and effects
  -> runtime reaches final current state for that dispatch
  -> selector or projection runs against that final state
```

The important boundary is the same one used by `runtime.run(...)`.

- synchronous transitions are complete
- synchronous effects are complete
- async effects may still be in flight

If you need to wait for async work, keep using the async and timer helpers described in [Async](./async.md) and [Testing](./testing.md).

## Prefer Machine Selectors

The default style in Fizz is to keep reusable derived reads on the machine with `selectWhen(...)`.

```ts
import {
  action,
  createMachine,
  createRuntime,
  selectWhen,
  state,
} from "@tdreyno/fizz"

const localChanged = action("LocalChanged").withPayload<{ value: string }>()

const Editing = state(
  {
    Enter: () => undefined,
  },
  { name: "Editing" },
)

const Viewing = state(
  {
    LocalChanged: (_, payload) => Editing({ value: payload.value }),
  },
  { name: "Viewing" },
)

const NotesMachine = createMachine({
  actions: { localChanged },
  selectors: {
    renderInputs: selectWhen(Editing, data => ({
      canSave: data.value.length > 0,
      preview: data.value.trim(),
    })),
  },
  states: { Editing, Viewing },
})

const runtime = createRuntime(NotesMachine, Viewing({ value: "" }))

const renderInputs = await runtime.runAndSelect(
  localChanged({ value: " draft text " }),
  NotesMachine.selectors.renderInputs,
)
```

Use this form when:

- the derived read belongs to the machine itself
- the same read is reused in React and non-React code
- you want explicit state narrowing through selector definitions

## Use A Projection For Narrow Adapter Logic

Sometimes the read is truly local to one integration point. In that case, pass a projection function.

```ts
const renderInputs = await runtime.runAndSelect(
  localChanged({ value: " draft text " }),
  state => {
    if (!state.is(Editing)) {
      return { canSave: false, preview: "" }
    }

    return {
      canSave: state.data.value.length > 0,
      preview: state.data.value.trim(),
    }
  },
)
```

Use this form when:

- the read is only needed in one adapter
- promoting it to a machine selector would add noise instead of clarity
- the projection is still simple enough to read at the call site

If the projection grows, move it back into `machine.selectors`.

## Final-State Behavior

`runAndSelect(...)` reads from the final current state after one dispatch cycle completes.

That means it behaves well with chained synchronous transitions:

```text
enter()
  -> A.Enter returns [B(), next()]
  -> runtime moves to B
  -> runtime runs next()
  -> B.Next returns C()
  -> projection reads C
```

This is useful when one action fans through multiple synchronous steps and the caller only cares about the final machine-visible result.

## What It Does Not Do

`runAndSelect(...)` is not a new async boundary.

It does not:

- wait for `startAsync(...)` or `debounceAsync(...)` to settle
- replace `runtime.run(...)` for normal event dispatch
- replace `runStateSelector(...)` when you already have the current state and just need a pure read

If the call site already has `runtime.currentState()` and `runtime.context`, a direct selector read is still the clearest option.

## Testing The Pattern

For transition-only behavior, test the same way you test any normal runtime dispatch:

```ts
const selected = await runtime.runAndSelect(save(), machine.selectors.canSave)

expect(selected).toBe(true)
expect(runtime.currentState().is(Editing)).toBeTruthy()
```

When async work matters, drive the controlled async or timer drivers directly and assert after the relevant flush or advance step. See [Testing](./testing.md) for the harness and driver patterns.

## Choosing Between The Options

- use `runtime.run(...)` when you only need to dispatch
- use `runtime.runAndSelect(...)` when one imperative step needs dispatch plus immediate derived read
- use `runStateSelector(...)` when the runtime is already in the correct state and no dispatch is needed

## Related Docs

- [API](./api.md)
- [Testing](./testing.md)
- [React Integration](./react-integration.md)
- [Async](./async.md)
