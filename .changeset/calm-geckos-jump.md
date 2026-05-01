---
"@tdreyno/fizz": minor
---

Add a first-class imperative `commandEffect(...)` helper with chained action mapping via `.chainToAction(resolve, reject?)`.

Runtimes can now register `commandHandlers` by channel and command type, derive them from injected clients with `commandHandlersFromClients(...)`, and configure missing-handler behavior through `commandMissingHandler` (`noop` default, `warn`, or `error`).
