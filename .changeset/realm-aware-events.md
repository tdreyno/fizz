---
"@tdreyno/fizz": patch
---

Make DOM events and observers realm-aware so they work correctly in jsdom and cross-realm DOM setups (for example, elements inside an iframe document).

When dispatching events from a string type (e.g., `dispatchEvent("input")`), Fizz now resolves the `Event` or `CustomEvent` constructor from the target element's `ownerDocument.defaultView` instead of always using `globalThis`. Likewise, `observeIntersection` and `observeResize` now resolve the `IntersectionObserver` / `ResizeObserver` constructor from the observed element's realm. All cases fall back to `globalThis` constructors when no realm is available.

Consumers no longer need manual realm fallback workarounds; events and observers are created in the correct realm automatically.

**Example:**

```typescript
// Before: consumer had to implement fallback
const EventCtor = element.ownerDocument?.defaultView?.Event ?? globalThis.Event
element.dispatchEvent(new EventCtor("input", { bubbles: true }))

// After: realm-aware automatically
dom.fromElement(element, "target").dispatchEvent("input", { bubbles: true })
// Event is created in element's realm automatically
```

**Details:**

- Adds realm resolution to `dispatchEvent` (`resolveWindowFromTarget()` / `getEventConstructor()` helpers)
- The `RuntimeDomDriver` observer factory methods (`createIntersectionObserver`, `createResizeObserver`) now receive the observed `target` element as an optional argument so the default driver can resolve the correct realm constructor
- The default browser driver and the test browser driver both resolve observers from the target element's realm
- Adds test coverage: realm-aware event creation, target forwarding to observer factories, and realm-scoped observer construction
- Updated documentation in `docs/browser-dom.md` and `skills/fizz/references/browser-effects.md`

