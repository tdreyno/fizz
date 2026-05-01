# Runtime Registry

Use this guide when you need keyed runtime reuse and explicit teardown outside React.

`createRuntimeRegistry(...)` is an optional utility from `@tdreyno/fizz` that standardizes create/reuse/dispose behavior for integrations that would otherwise hand-roll `Map` or `WeakMap` caching.

## When To Use It

Use a runtime registry when your integration has stable external keys and can mount/unmount repeatedly, for example:

- keyed DOM root render loops
- tabs, panes, or workspace IDs
- route-specific runtime caches

If you only ever create one runtime and keep it for the entire app lifetime, you likely do not need this utility.

## Mental Model

```text
key -> registry lookup
     -> hit: reuse runtime
     -> miss: init() creates runtime

unmount key -> dispose(key)
shutdown    -> disposeAll()
```

The registry keeps lifecycle explicit:

- create happens only through `getOrCreate(key, init)`
- teardown happens only through `dispose(key)` or `disposeAll()`
- diagnostics can observe lifecycle via optional `onLifecycleEvent`

## Basic Usage

```ts
import {
  createMachine,
  createRuntime,
  createRuntimeRegistry,
  enter,
  state,
} from "@tdreyno/fizz"

const Ready = state(
  {
    Enter: () => undefined,
  },
  { name: "Ready" },
)

const machine = createMachine({ states: { Ready } })

const registry = createRuntimeRegistry<string | object>()

const runtime = registry.getOrCreate("notes:1", () => {
  const created = createRuntime(machine, Ready())

  void created.run(enter())

  return created
})

// Later when this key is no longer active
registry.dispose("notes:1")
```

## API Surface

Registry methods:

- `getOrCreate(key, init)`
- `get(key)`
- `has(key)`
- `dispose(key)`
- `disposeAll()`
- `values()`

Options:

- `disposeRuntime` (optional): custom teardown callback. Default behavior calls `disconnect()` when the value provides it.
- `onLifecycleEvent` (optional): receives `created`, `reused`, `disposed`, and `dispose-error` events.
- `removeOnFailure` (optional, default `true`): remove entries even if disposal throws.

## Disposal Behavior

`dispose(key)` returns a structured result so callers can assert behavior in tests and diagnostics.

- `{ disposed: false }` when the key does not exist
- `{ disposed: true }` when disposal succeeds
- `{ disposed: true, error }` when disposal throws

When `removeOnFailure` is `true` (default), a failing disposal still removes the key from the registry.
When `removeOnFailure` is `false`, the entry remains so callers can retry.

## Deterministic `disposeAll()`

`disposeAll()` disposes entries in deterministic insertion order:

- primitive keys in insertion order
- object keys in tracked insertion order

It returns a summary with counts and failures for diagnostics.

## Practical Integration Pattern

```ts
type MountHandle = {
  unmount: () => void
}

const mounts = createRuntimeRegistry<HTMLElement>()

export const mount = (root: HTMLElement): MountHandle => {
  mounts.getOrCreate(root, () => {
    const created = createRuntime(machine, Ready())

    void created.run(enter())

    return created
  })

  return {
    unmount: () => {
      mounts.dispose(root)
    },
  }
}

export const shutdownAll = () => {
  const result = mounts.disposeAll()

  if (result.failed > 0) {
    console.warn("Some runtimes failed to dispose", result.errors)
  }
}
```

## Related Docs

- [API](./api.md)
- [Debugging](./debugging.md)
- [React Integration](./react-integration.md)
