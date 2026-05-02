---
"@tdreyno/fizz": minor
---

Add a new `@tdreyno/fizz/test/browser` entrypoint for platform-agnostic browser runtime tests.

New testing APIs include:

- `createBrowserTestHarness(...)`
- `fireEvent(target, type, init?)`
- `fireClick(target, init?)`
- `fireInput(target, init?)`
- `fireChange(target, init?)`
- `fireSubmit(target, init?)`
- `flushFrames(harness, count, frameMs?)`
- `firePointerDown(target, init?)`
- `firePointerMove(target, init?)`
- `firePointerUp(target, init?)`
- `fireFocusIn(target, init?)`
- `fireFocusOut(target, init?)`
- `fireKeyDown(target, init?)`
- `fireKeyUp(target, init?)`
- `firePointerDrag(target, options?)`
- `fireTextInput(target, options)`
- `fireFormSubmit(target, options?)`
- `expectCommandOrder(harness, expectedTypes)`

The browser harness accepts an explicit `document` and exposes framework-agnostic recorded browser-effect stubs through `harness.browserDriver`, making the helper usable from Jest, Vitest, and `node:test` setups.