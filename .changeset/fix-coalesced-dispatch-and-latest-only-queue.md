---
"@tdreyno/fizz": patch
---

Fix coalesced DOM listener dispatching so animation-frame and microtask modes correctly keep the latest event while an action is still running, and harden latest-only imperative command queueing so synchronous handlers and queued replacements resolve through runAction reliably.
