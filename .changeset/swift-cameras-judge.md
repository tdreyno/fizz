---
"@tdreyno/fizz": minor
---

Updates selector predicate callbacks to use a data-first signature.

- `@tdreyno/fizz`
  - `selectWhen(...)` function selectors now receive `(data, state, context)` instead of `(state, context)`.
  - This makes data predicates easier to reuse directly, including unary matchers like `isMatching(...)` from `ts-pattern`.
  - `runStateSelector(...)` now invokes selector callbacks with `state.data` as the first argument.
  - Matcher-object shorthand behavior is unchanged.

Migration:

- Before: `selectWhen(Editing, state => !state.data.readOnly)`
- After: `selectWhen(Editing, (data, state) => !data.readOnly)`
