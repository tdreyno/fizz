---
"@tdreyno/fizz": minor
---

# Async chaining

Move `startAsync(...)` and `debounceAsync(...)` to chain-first action mapping.

- Change `startAsync(...)` to return a builder and map settled results with `.chainToAction(resolve, reject)`.
- Change `debounceAsync(...)` to return a builder and map settled results with `.chainToAction(resolve, reject?)`.
- Update async docs, skill references, and workspace examples to the fluent chaining form.
- Keep the release marked as minor even though this changes the public API shape.
