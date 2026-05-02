---
"@tdreyno/fizz": major
---

**BREAKING:** Move debug and registry utilities to opt-in subpaths for better tree-shaking

- **BREAKING:** Remove `runtimeDebugConsole`, `createRuntimeConsoleMonitor`, `createRuntimeDebugConsole`, `formatRuntimeDebugEvent`, `RuntimeMonitor` from root `@tdreyno/fizz` exports
- **BREAKING:** Remove `createRuntimeRegistry` and `RuntimeRegistry` from root `@tdreyno/fizz` exports
- Create `@tdreyno/fizz/debug` subpath for debugging utilities: `import { createRuntimeDebugConsole } from "@tdreyno/fizz/debug"`
- Create `@tdreyno/fizz/registry` subpath for registry lifecycle APIs: `import { createRuntimeRegistry } from "@tdreyno/fizz/registry"`
- Enables bundlers to tree-shake unused debug/registry code when not explicitly imported
- Reduces core bundle size by allowing debug and registry modules to be excluded from builds that don't need them
- Update imports in your code to use the new subpaths if you use these utilities
