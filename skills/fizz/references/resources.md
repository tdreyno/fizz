# State Resources

Use this reference when the task involves state-scoped resources, subscription ownership, or mapping external resource events into actions.

## Resource Helpers

Fizz exposes three resource helpers:

- `resource(key, value, teardown?)`
- `abortController(key)`
- `subscription(key, subscribe)`

Resource values are available from handler `utils.resources`.

## Lifecycle Rules

- resources are state-scoped and runtime-owned
- resources survive same-state `update(...)` transitions
- resources are released automatically on state exit
- resource release does not emit context change events

Runtime monitors emit resource lifecycle events:

- `resource-registered`
- `resource-released`
- `resource-release-failed`

## Resource Bridge

`resource(...)` supports event-to-action bridging with a fluent chain:

- `resource(...).bridge(options).chainToAction(resolve, reject?)`

Bridge arguments:

- `options.filter?`: optional event predicate
- `options.pace?`: `"latest" | { debounceMs: number }`
- `options.subscribe?`: optional adapter `(value, onEvent) => unsubscribe`

`bridge(options)` requires an options object. At least one of `filter`, `pace`, or `subscribe` must be present.

Bridge behavior:

- subscription is active only while state is active
- bridge subscription is disposed on state exit
- pending latest/debounce bridge work is cancelled at disposal

Use this when callback glue belongs in machine lifecycle, not controller adapters.

## Example

```typescript
import { action, resource, state } from "@tdreyno/fizz"

const localChanged = action("LocalChanged").withPayload<string>()
const bridgeFailed = action("BridgeFailed").withPayload<{ message: string }>()

const Editing = state({
  Enter: () =>
    resource("editor", createEditorResource())
      .bridge({ pace: { debounceMs: 120 } })
      .chainToAction(
        text => localChanged(String(text)),
        error => bridgeFailed({ message: String(error) }),
      ),
})
```

## Related References

- `core-runtime.md` for runtime setup and state helper context
- `async-and-scheduling.md` for async cancellation and debounced request flows
- `testing.md` for deterministic runtime tests with controlled drivers
