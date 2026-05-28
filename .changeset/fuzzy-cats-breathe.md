---
"@tdreyno/fizz": minor
---

Add DOM convenience helpers `setInnerHTML(html)`, `clearChildren()`, `appendChildren(...children)`, `prependChildren(...children)`, `replaceChildren(...children)`, and `ownerDocument()` to reduce common `mutate(...)` boilerplate for content updates and document-scoped chaining.

`setInnerHTML(html)` is shorthand for property writes like `setProperty("innerHTML", html)`, while the children helpers are shorthands for `mutate(...)` calls around `append`, `prepend`, and `replaceChildren`.

Add `dispatchEvent(new Event(...))` sugar alongside `dispatchEvent(type, init?)` so prebuilt event instances can be dispatched without dropping to `mutate(...)`.

Also update browser DOM docs and browser-effects reference lists to include the new helpers.
