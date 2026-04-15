---
"@tdreyno/fizz": patch
"@tdreyno/fizz-react": patch
"@tdreyno/fizz-svelte": patch
---

Tighten the core root API surface by removing `LoadingMachine`, `beforeEnter`, `stateWrapper`, and deprecated `createAction` from the `@tdreyno/fizz` root barrel.

Fizz now bootstraps the initial state on the first `runtime.run(enter())`, so React, Svelte, test helpers, and manual runtime setup no longer need a separate `beforeEnter(runtime)` call.

Refresh the core API reference and repository skills/docs to match the cleaned-up runtime lifecycle and public exports.
