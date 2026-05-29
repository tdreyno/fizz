---
"@tdreyno/fizz": minor
---

Add a reusable `matchOn(...)` helper for mapping discriminated async outcomes to actions while keeping `chainToAction(...)` unchanged.

Add a new `.match({ ok, err?, cancelled? })` terminal to async builders:

- `startAsync(...)`
- `debounceAsync(...)`
- `requestJSONAsync(...)`
- `customJSONAsync(...)`

`ok` is required, while `err` and `cancelled` are optional.

Async builders now support typed error-channel generics so `err` and `chainToAction(..., reject)` can use a narrower error type when desired (default remains `unknown`).

Cancellation handlers from `.match({ cancelled })` now dispatch when active async work is cancelled or aborted (including explicit `cancelAsync(asyncId)` and replacement by a newer operation with the same id).

`matchOn(...)` returns a standard resolve handler function, so it can be passed directly into `startAsync(...)`, `debounceAsync(...)`, `requestJSONAsync(...)`, `customJSONAsync(...)`, and resource bridge chaining.

**Example:**

```typescript
startAsync(loadSaveResult, "save").chainToAction(
  matchOn(
    result => result.kind,
    {
      aborted: () => saveAborted(),
      invalid: result => saveInvalid(result.reason),
      saved: result => saveSucceeded(result.revision),
      skipped: () => undefined,
    },
  ),
  saveFailed,
)
```

This release also updates async/resource docs and Fizz skill references to document when to use `matchOn(...)` and `.match(...)` outcome mapping.
