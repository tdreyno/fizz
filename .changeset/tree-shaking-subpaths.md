---
"@tdreyno/fizz": minor
---

Add opt-in subpaths for debugging and registry utilities to improve tree-shaking

- Create `@tdreyno/fizz/debug` subpath for debugging utilities (`createRuntimeDebugConsole`, `createRuntimeMonitor`)
- Create `@tdreyno/fizz/registry` subpath for registry lifecycle APIs (`createRuntimeRegistry`, `RuntimeRegistry`)
- Remove debug and registry exports from root `@tdreyno/fizz` export surface
- Allows bundlers to tree-shake unused debug/registry code when not imported from subpaths
- Maintains full backward compatibility through opt-in subpath imports
- Comprehensive bundle size measurement and validation completed
