---
"@tdreyno/fizz": minor
---

Support plain-object single returns as same-state update shorthand in object-data handlers. This applies across core `state(...)` handlers and fluent callbacks, including common async, timer/interval, and browser DOM mapper patterns.

Guardrails remain explicit: array data states still require `update(...)`, and plain objects inside top-level returned handler arrays are not reinterpreted.

Docs, skill references, and proposal guidance now describe the shorthand and its boundaries.