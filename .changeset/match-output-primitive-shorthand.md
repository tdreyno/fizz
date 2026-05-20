---
"@tdreyno/fizz": minor
---

Allow primitive values in `matchOutput(...)` handler maps.

Handler-map entries can now be either a function `(action) => value | undefined`
or a direct value. Direct values resolve the wait with that value whenever the
output `type` matches, which is convenient for predicate-style mappings:

```ts
const result = await runtime.runUntil(
  save(),
  matchOutput({
    Saved: true,
    Failed: false,
  }),
)
```

Function entries continue to work as before and may return `undefined` to skip
a match.
