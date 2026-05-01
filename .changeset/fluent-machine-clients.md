---
"@tdreyno/fizz": minor
"@tdreyno/fizz-react": minor
---

Add typed machine clients support via runtime options and state handler utilities, including `utils.clients` access in handlers.

Add a no-build fluent machine API with `machine(name?)` and chainable `withStates`, `withActions`, `withOutputActions`, `withSelectors`, and `withClients` methods.

Expose fluent state `withClients<...>()` typing so service dependencies are easy to inject and mock in tests.
