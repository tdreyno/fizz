---
"@tdreyno/fizz": minor
---

Add additive, opt-in runtime and builder APIs.

- `selectWhen(...)` accepts a `defaultValue` so non-matching selectors can resolve to a stable value instead of `false`/`undefined`.
- `Runtime#subscribeSelector(selector, listener, options?)` subscribes to a selector's derived value, firing `(next, previous)` on change with an optional `equalityFn` and `emitInitial`.
- `Runtime#onPathTransition(listener, options?)` fires when the active state path changes, including nested-machine transitions that do not change the top-level state name.
- `route(options?)` supports strict/unmatched handling via `{ strict, onUnmatched }`, throwing `RouteUnmatchedError` or invoking `"warn"`/a custom callback when no branch matches. `getRouteMetadata(...)` branches now carry `id` and `index`.
- `stateWithNested(...)` accepts forwarding controls (`forward`, `mapPayload`, `beforeForward`, `afterForward`) to scope, transform, and observe actions forwarded to the child runtime.
