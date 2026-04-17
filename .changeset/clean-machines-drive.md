---
"@tdreyno/fizz": major
"@tdreyno/fizz-react": patch
---

Remove the old `createRuntime(context, actions, outputActions, options?)` signature.

`createRuntime(...)` now requires `createRuntime(machine, initialState, options?)`, and low-level context-based callers should construct `new Runtime(...)` directly.

Update the React integration to use the machine-first runtime entrypoint.
