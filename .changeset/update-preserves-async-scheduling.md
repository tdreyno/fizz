---
"@tdreyno/fizz": patch
---

Fix `update(...)` transition behavior so in-flight async, timer, interval, and frame work is preserved on same-state updates. If your flow previously relied on implicit cancellation during `update(...)`, call explicit cancellation helpers such as `cancelAsync(...)` instead.
