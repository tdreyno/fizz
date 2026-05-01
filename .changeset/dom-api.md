---
"@tdreyno/fizz": minor
---

Add comprehensive DOM query, listener, and observer APIs as state-scoped resources:

- **DOM Queries**: `dom.getElementById()`, `dom.getElementsByClassName()`, `dom.getElementsByName()`, `dom.getElementsByTagName()`, `dom.querySelector()`, `dom.querySelectorAll()`, `dom.closest()`
- **Singleton Targets**: `dom.window()`, `dom.document()`, `dom.body()`, `dom.documentElement()`, `dom.activeElement()`, `dom.visualViewport()`
- **Event Listeners**: `dom.listen(targetId, type, handler)` with automatic cleanup and scope-based lifecycle
- **Observers**: `dom.observeIntersection()` and `dom.observeResize()` for viewport and size tracking
- **Resource Scoping**: All queries, listeners, and observers are state-scoped resources automatically cleaned up on state exit
- **Scoped Queries**: Chain queries from acquired elements using `dom.from(resourceId)`

Available from `@tdreyno/fizz/browser` entrypoint. All effects integrate with the runtime's state resource system and support custom driver overrides for testing.
