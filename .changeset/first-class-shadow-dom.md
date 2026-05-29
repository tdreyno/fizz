---
"@tdreyno/fizz": minor
---

# First-Class Shadow DOM Support

Add first-class Shadow DOM support for browser DOM effects and query acquisition.

This release introduces an opt-in runtime default DOM query scope and a configurable browser driver factory so unscoped DOM queries can target a Web Component's shadow root by default.

**New APIs:**

- `defaultDomQueryScope` runtime option (for `createRuntime(...)` and `Runtime` constructor options)
- `createBrowserDriver({ defaultQueryScope })` from `@tdreyno/fizz/browser`
- `RuntimeDomQueryScope` driver type now includes `Document | Element | ShadowRoot`

**Behavior updates:**

- `dom.outsidePointerDown(...)` and `dom.outsideFocusIn(...)` now prefer `event.composedPath()` when available, with `contains(...)` fallback, so outside detection works across shadow boundaries and retargeted events.
- Runtime browser module query acquisition can use the configured default query scope when a query effect does not provide an explicit scope resource.

Existing behavior remains unchanged unless a default scope is explicitly configured.

**Example:**

```typescript
import { createRuntime, enter } from "@tdreyno/fizz"
import { browserDriver, createBrowserDriver } from "@tdreyno/fizz/browser"

const runtime = createRuntime(machine, machine.states.Ready(), {
  browserDriver,
  defaultDomQueryScope: host.shadowRoot ?? undefined,
})

const scopedDriver = createBrowserDriver({
  defaultQueryScope: host.shadowRoot ?? undefined,
})

await runtime.run(enter())
```
