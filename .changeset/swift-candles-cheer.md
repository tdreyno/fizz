---
"@tdreyno/fizz": minor
---

# Summary

Add automatic Chrome debugger runtime registration through a page-global runtime registry so browser runtimes can appear in the DevTools panel without manual `createFizzChromeDebugger()` wiring.

Remove the old global hook compatibility surface. `@tdreyno/fizz` no longer exports the hook key or hook types, and `@tdreyno/fizz-chrome-debugger` no longer installs or restores a global hook on the page target.

Rename the public bridge installer surface to match the registry-based model: `installFizzChromeDebuggerHook()` and its related installed/options types are replaced by `installFizzChromeDebugger()` and matching registry-neutral type names.
