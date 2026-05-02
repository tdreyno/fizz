---
"@tdreyno/fizz": minor
---

Add fluent DOM listener helper chaining for browser event handling.

New browser APIs include:

- `dom.document().onKeyPress().matchesKey(...).chainToAction(...)` (and the same pattern from `listen(...)`, `onKeyDown()`, and `onKeyUp()`)
- `dom.outsidePointerDown(...)` and `dom.outsideFocusIn(...)` for document-scoped outside checks
- `isBypassedLinkActivation(event)` for SPA link interception bypass checks

The existing `listen(type, handler, options?)` and `onEvent(handler, options?)` forms remain supported.
