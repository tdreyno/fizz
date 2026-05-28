---
"@tdreyno/fizz": minor
---

Allow nested child handlers in `stateWithNested(...)` to read parent state resources via `utils.resources` fallback.

When child and parent resource keys overlap, child resources take precedence for that handler execution.
