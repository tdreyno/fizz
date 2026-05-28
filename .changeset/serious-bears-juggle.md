---
"@tdreyno/fizz": minor
---

Add typed DOM write helpers for form and input workflows, including `setValue`, `setChecked`, `setText`, `setProperty`, `setAttribute`, `setSelectionRange`, and `dispatchEvent` with sensible UI defaults.

Also add input-specific query convenience builders via `dom.input(...)` and `dom.from(...).input(...)`, plus docs and browser-effects reference updates for declarative form/autocomplete patterns.

Add matching convenience builders for `textarea` and `select` via `dom.textarea(...)`, `dom.select(...)`, and scoped variants `dom.from(...).textarea(...)` / `dom.from(...).select(...)`.
