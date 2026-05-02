---
"@tdreyno/fizz": patch
---

Improve `fizz machines` and `fizz visualize` machine/state discovery to be export-agnostic and support single-file JavaScript machines.

- Discover `createMachine(...)` roots without requiring `export default`.
- Support named-exported and unexported top-level machine constants.
- Resolve state entries from inline/local/imported state objects without requiring a specific export shape.
- Include `.js` and `.jsx` sources in CLI machine discovery.
- Preserve existing multi-file state-index visualization behavior while adding single-file inline-state graph support.
