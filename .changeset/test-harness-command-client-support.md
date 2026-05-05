---
"@tdreyno/fizz": patch
---

Add test harness parity for runtime command/client injection.

`createTestHarness(...)` (and `createBrowserTestHarness(...)` through shared options) now support passing `commandHandlers`, `clients`, `commandMissingHandler`, `monitor`, and `debugLabel` to the underlying runtime.

This makes it possible to test `commandEffect(...)` flows directly with harness utilities instead of switching to manual runtime setup.
