---
"@tdreyno/fizz": minor
---

Flatten one level of nested arrays returned from state handlers.

Handler return arrays are now flattened a single level before being converted
to runtime commands. This means helpers that produce groups of effects — for
example DOM builders like `dom.body().listen(...)`, the convenience
`dom.<target>().on<Event>(...)` listener helpers, scoped queries returned from
`dom.from(...)`, and branch returns inside `whichTimeout(...)` /
`whichInterval(...)` — can be composed inline without the `...` spread
operator:

```ts
const Watching = state({
  Enter: () => [
    dom.body().listen("click", () => Clicked()),
    dom.window().onResize(() => WindowResized()),
  ],
})
```

A new exported type `NestedStateReturn` (a single `StateReturn` or a
`ReadonlyArray<StateReturn>`) describes the items allowed inside the returned
array. Existing handlers that return a flat array, a single effect/action, or
a transition continue to work unchanged.
