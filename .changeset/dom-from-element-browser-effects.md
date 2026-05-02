---
"@tdreyno/fizz": minor
---

Add `dom.fromElement(resourceId, element)` to `@tdreyno/fizz/browser`.

This new DOM acquire helper wraps an already-known element reference as a state-scoped DOM resource, so it can use the same fluent APIs as other DOM builders (`mutate`, `listen`, `observeIntersection`, `observeResize`, and `resource`).

This is useful when handlers already carry an element reference (for example, drag interactions) and still want explicit, chained DOM effects with normal Fizz resource lifecycle behavior.
