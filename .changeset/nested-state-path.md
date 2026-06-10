---
"@tdreyno/fizz": minor
---

Add composed state-path introspection and nested child-entry ergonomics.

`getStatePath(stateOrRuntime, options?)` builds a composed, hierarchical path string for a state and any nested child regions it owns (mirroring XState's `state.toStrings()` for logging and analytics). It accepts either a state transition or anything exposing a `currentState()` accessor, walks the nested child runtime stored under each level's data, and joins state names with a configurable separator (default `"/"`, e.g. `"Connected/Live"`). A flat state returns just its name. `Runtime#currentStatePath(options?)` is added as a convenience accessor that returns `getStatePath(this.currentState(), options)`. Both `getStatePath` and the `StatePathOptions` type are exported from the package root and from the `@tdreyno/fizz/nested` subpath.

`stateWithNested(...)` now accepts a resolver function `(data) => StateTransition` for its `initialNestedState` argument in addition to a bare `StateTransition`. This lets a parent enter a nested region at a chosen non-initial child state based on the parent's data, without full deep path targeting. Passing a bare `StateTransition` continues to work unchanged.
