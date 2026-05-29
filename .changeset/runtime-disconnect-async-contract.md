---
"@tdreyno/fizz": minor
---

# Runtime disconnect async contract

Document and verify the async teardown contract for `runtime.disconnect()`.

Fizz now ships explicit regression coverage for disconnect behavior across `startAsync(...)`, `debounceAsync(...)`, `requestJSONAsync(...)`, and `customJSONAsync(...)`, and the public docs now describe the supported close-path pattern of `flushAsync(...)` followed by `disconnect()`.

React integration and Fizz skill references were updated to clarify that component unmount uses the same runtime teardown guarantees.
