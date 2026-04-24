---
"@tdreyno/fizz": minor
"@tdreyno/fizz-react": minor
---

# Browser Runtime Support

Adds first-class browser runtime support across core and React integration.

- `@tdreyno/fizz`
  - Added browser effect helpers: `confirm(...)`, `prompt(...)`, `alert(...)`, `copyToClipboard(...)`, `openUrl(...)`, `printPage()`, `locationAssign(...)`, `locationReplace(...)`, `locationReload()`, `historyBack()`, `historyForward()`, `historyGo(...)`, and `postMessage(...)`.
  - Added built-in actions for browser request/response flows: `ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, and `PromptCancelled`.
  - Added runtime `browserDriver` support to execute browser effects.
  - Added a new public subpath export: `@tdreyno/fizz/browser`.

- `@tdreyno/fizz-react`
  - `useMachine(...)` now accepts `driver` and forwards it to runtime `browserDriver`.
  - Runtime cleanup now calls `runtime.disconnect()` during stop/unmount lifecycle.

Usage:

- Import the browser implementation from `@tdreyno/fizz/browser` and pass it via React `useMachine(..., { driver: browserDriver })` or core `createRuntime(..., { browserDriver })`.
- Model browser confirmation and prompt flows as machine state transitions that handle `ConfirmAccepted` / `ConfirmRejected` and `PromptSubmitted` / `PromptCancelled`.
