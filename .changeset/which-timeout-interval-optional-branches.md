---
"@tdreyno/fizz": patch
---

`whichTimeout(...)` and `whichInterval(...)` branch maps are no longer required
to be exhaustive. A timeout or interval id with no matching branch resolves to
`undefined` and is treated as a no-op, matching how `state(...)` handles actions
without a registered handler.

Unknown ids outside the declared union are still rejected at the type level.
