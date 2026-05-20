---
"@tdreyno/fizz": minor
---

Add `classList`, `classListSet`, `callMethod`, and `applyMethod` DOM effect
helpers, plus an optional element-type generic on the query builders.

Every DOM resource builder returned by `dom.<query>(...)`,
`dom.fromElement(element, resourceId?)`, and `dom.from(scope).<query>(...)`
now exposes four typed imperative-write helpers in addition to `.mutate(fn)`:

- `.classList({ add?, remove?, toggle?, replace? })` — grouped class-list
  mutation in one call. Operations apply in the order
  `remove` → `replace` → `toggle` → `add`. Multi-element resources apply
  every operation to every matched element.
- `.classListSet(classes)` — replaces the element's entire class list.
- `.callMethod(name, ...args)` — invokes a method on the acquired element,
  modeled on `Function.prototype.call` (variadic args).
- `.applyMethod(name, args)` — same as `.callMethod` but takes a single args
  array, modeled on `Function.prototype.apply`.

`.callMethod` and `.applyMethod` skip elements that do not implement the
named method at runtime, so they are safe on heterogeneous lists.

All four helpers desugar to the existing `domMutate` effect, so there are no
new effect kinds in the runtime.

The query helpers (`closest`, `getElementById`, `getElementsByClassName`,
`getElementsByName`, `getElementsByTagName`, `querySelector`,
`querySelectorAll`) now accept an optional `<TElement extends Element>`
generic that flows into the returned builder. The default stays `Element`,
so existing callers compile unchanged.

```ts
// Before
...dom.fromElement(data.modal, "modal").mutate(node => {
  node.classList.remove("hidden", "modal-closing")
  node.classList.add("modal-opening")
})

// After
...dom.fromElement(data.modal, "modal").classList({
  remove: ["hidden", "modal-closing"],
  add: ["modal-opening"],
})

// Typed web-component method call
...dom
  .querySelectorAll<EmojiPickerField>("emoji-picker-field", "pickers")
  .callMethod("closePopover")
```

`.mutate(fn)` is preserved as the escape hatch for writes that none of the
typed helpers cover.
