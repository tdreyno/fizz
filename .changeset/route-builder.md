---
"@tdreyno/fizz": minor
---

Add a declarative, ordered-guard `route()` builder for state handlers.

`route<Data, Payload>()` returns an immutable builder whose value is itself a state handler `(data, payload, utils) => HandlerReturn<Data>`, so it drops directly into an `Enter` slot (a transient, eventless transition) or any action handler slot (a guarded transition on an event). Branches are declared with `.when(predicate, target, options?)` and an optional final `.otherwise(target, options?)`; they evaluate top to bottom and the first matching predicate wins. Predicates are synchronous and pure `(data, payload) => boolean` (or TypeScript type guards that narrow the target's `data` locally). Targets receive `(data, payload, utils)` and may return a transition, effect/action array, bare data (implicit update), or a promise; a bare `BoundStateFn` is accepted directly. When no branch matches and there is no `otherwise`, the handler stays put (returns `undefined`).

Also adds `getRouteMetadata(handler)`, which returns the ordered branch descriptors (`{ predicate?, label, otherwise }`) for tooling and introspection, or `undefined` for non-route handlers.
