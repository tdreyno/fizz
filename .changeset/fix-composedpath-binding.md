---
"@tdreyno/fizz": patch
---

Fix `TypeError: Illegal invocation` in outside-target helpers by calling `event.composedPath` with bound context (`composedPath.call(event)`) instead of as a detached function reference.
