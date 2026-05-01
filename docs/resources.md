# State Resources

State resources let you keep runtime-owned values alongside a state lifecycle without storing them in state data.

Use resources for values like:

- AbortController instances
- subscription teardown handles
- editor/session adapters
- runtime-owned browser objects

## Helpers

Fizz provides three resource helpers:

- `resource(key, value, teardown?)`
- `abortController(key)`
- `subscription(key, subscribe)`

Resources are available in handler utils through `resources`.

```typescript
import { abortController, resource, state, subscription } from "@tdreyno/fizz"

type Data = { saved: string[] }
type Resources = {
  ac: AbortController
  sessionId: string
  unsubscribePresence: () => void
}

const Editing = state<any, Data, string, string, string, Resources>({
  Enter: () => [
    abortController("ac"),
    resource("sessionId", crypto.randomUUID()),
    subscription("unsubscribePresence", () =>
      presenceStore.subscribe(() => {}),
    ),
  ],

  Save: (data, payload, { resources, update }) => {
    resources.ac.abort()

    return update({
      ...data,
      saved: [...data.saved, `${payload}:${resources.sessionId}`],
    })
  },
})
```

## Lifecycle

Resource ownership is runtime-owned and state-scoped.

- resources are registered while the state is active
- resources are preserved across same-state `update(...)` transitions
- resources are released automatically on state exit
- resource release does not trigger context updates

`teardown` is optional for `resource(...)`. If omitted, the value is removed from the state resource map during cleanup.

## Bridging Events To Actions

`resource(...)` supports a fluent bridge for subscribed event streams.

- `resource(...).bridge(options).chainToAction(resolve, reject?)`

Bridge parameters:

- `options.filter?`: optional event predicate
- `options.pace?`: `"latest" | { debounceMs: number }`
- `options.subscribe?`: optional adapter `(value, onEvent) => unsubscribe`

`bridge(options)` requires an options object. At least one of `filter`, `pace`, or `subscribe` must be provided.

```typescript
import { action, resource, state } from "@tdreyno/fizz"

const localChanged = action("LocalChanged").withPayload<string>()
const bridgeFailed = action("BridgeFailed").withPayload<{ message: string }>()

type Data = { draft: string }

const Editing = state({
  Enter: () =>
    resource("editor", createEditorResource())
      .bridge({ pace: { debounceMs: 120 } })
      .chainToAction(
        text => localChanged(String(text)),
        err =>
          bridgeFailed({
            message:
              err instanceof Error ? err.message : "Unknown bridge error",
          }),
      ),

  LocalChanged: (data, payload, { update }) =>
    update({
      ...data,
      draft: payload,
    }),
})
```

Bridge lifecycle behavior:

- bridge subscriptions are created while the state is active
- bridge subscriptions are disposed automatically on state exit
- pending `latest` and debounce bridge work is cancelled at disposal

## Related Docs

- [Custom Effects](./custom-effects.md)
- [API](./api.md)
- [Async](./async.md)
- [Testing](./testing.md)
