# Proposal: First-class DOM mutation effects

## Status

Draft.

## Motivation

The current `dom.<query>(...).mutate(fn)` API is powerful but verbose for
the two most common DOM side effects in machines:

1. Toggling CSS classes on an element. Today every consumer writes
   `dom.fromElement('id', el).mutate(node => node.classList.add('hidden'))`,
   often grouped with `.classList.remove(...)` calls.
2. Invoking a method on a web component or other element (e.g.
   `customElement.closePopover()`). Today consumers write
   `dom.querySelectorAll('id', 'emoji-picker-field').mutate(node => node.closePopover())`.

Both cases lose two things by routing through `mutate`:

- **Readability.** A reader has to parse an arbitrary callback body to
  determine what side effect happened.
- **Type safety.** `mutate` widens the element to `unknown` (or to the
  builder's `TElement`, which is `Element` for query-based builders), so
  method calls and class names are not type-checked against the actual
  element interface.

This proposal adds two narrowly typed DOM effects on top of the existing
`TargetBuilder` API: `.classList.*` and `.callMethod(name, ...args)`.
Both compile down to the same internal `domMutate` effect, so no runtime
plumbing changes.

## Goals

- Add chainable, typed DOM-class helpers: `addClass`, `removeClass`,
  `toggleClass`, `replaceClass`, `setClassList`.
- Add a typed method-invocation effect: `callMethod`.
- Keep `mutate` available as the escape hatch.
- Zero new effect kinds in the runtime — both helpers desugar to
  `domMutate`.
- Preserve current tree-shaking and debug-log behavior.

## Non-goals

- A full reactive class/attribute binding system. This proposal stays
  imperative; bindings remain a separate exploration.
- Attribute and dataset helpers (`setAttribute`, `removeAttribute`,
  `setDataset`). Those are listed in Future Work; the design here is
  intended to extend to them without reshaping the API.
- React integration changes. This proposal touches `packages/fizz` only.

## API design

### Class helpers

Today, on the builder returned by every `dom.<query>(...)`/`dom.fromElement(...)`
call:

```ts
type TargetBuilder<EventMap, TElement, EventHelpers> =
  Effect<DomAcquireEffectData> & {
    mutate: (fn: (element: TElement) => void) => Effect<unknown>[]
    // ...listen, observeIntersection, observeResize, resource, plus event helpers
  }
```

This proposal adds a `classList` sub-builder that mirrors the
`DOMTokenList` surface every consumer actually uses:

```ts
type ClassListBuilder = {
  add: (...tokens: string[]) => Effect<unknown>[]
  remove: (...tokens: string[]) => Effect<unknown>[]
  toggle: (token: string, force?: boolean) => Effect<unknown>[]
  replace: (oldToken: string, newToken: string) => Effect<unknown>[]
  set: (tokens: readonly string[]) => Effect<unknown>[]
}

type TargetBuilder<...> = Effect<DomAcquireEffectData> & {
  // ...existing fields
  classList: ClassListBuilder
}
```

Usage:

```ts
// Before
...dom.fromElement('modal', data.modal).mutate(node => {
  node.classList.remove('hidden', 'modal-closing')
  node.classList.add('modal-opening')
})

// After
...dom.fromElement('modal', data.modal).classList.remove('hidden', 'modal-closing'),
...dom.fromElement('modal', data.modal).classList.add('modal-opening'),
```

Each call returns the same `[builder, domMutate({...})]` tuple shape that
`.mutate` returns today, so multiple class calls compose naturally
inside the effect array returned by a state handler:

```ts
Enter: data => [
  ...dom.fromElement("modal", data.modal).classList.remove("hidden"),
  ...dom.fromElement("modal", data.modal).classList.add("modal-opening"),
  startTimer("openAnim", OPEN_ANIMATION_MS),
]
```

When the same target is used multiple times, the builder is acquired
once per call. This matches the current `mutate` semantics — `domAcquire`
is idempotent within a transition for a given `resourceId` — so there is
no extra DOM lookup cost.

For `querySelectorAll` builders that resolve to a `NodeList`, the helper
applies to every element (matching today's `mutate` semantics over
multi-element resources).

### Method invocation helper

```ts
type CallMethodHelper = {
  <TElement, TName extends keyof MethodsOf<TElement>>(
    this: TargetBuilder<unknown, TElement>,
    name: TName,
    ...args: Parameters<TElement[TName]>
  ): Effect<unknown>[]
}

type MethodsOf<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => unknown ? K : never
}[keyof T]
```

Usage:

```ts
// Before
...dom.querySelectorAll('emojiPickers', 'emoji-picker-field')
  .mutate(node => {
    if (typeof node.closePopover === 'function') node.closePopover()
  })

// After
...dom.querySelectorAll<EmojiPickerField>('emojiPickers', 'emoji-picker-field')
  .callMethod('closePopover')
```

`callMethod` requires the caller to parameterize the query (or use the
already-typed `dom.fromElement(id, el)` variant) so that TypeScript can
constrain `name` to actual method names of the element. For untyped
queries the call falls back to `string` and is still safe at runtime
because the implementation guards on `typeof element[name] === 'function'`.

For multi-element resources (`querySelectorAll`, `getElementsByTagName`,
etc.), `callMethod` invokes the method on every element, skipping any
element that does not implement it. This matches the defensive pattern
seen across consumers today.

### Typing for `dom.fromElement` and queries

`dom.fromElement(id, element)` already carries the element type because
the second argument is typed by the caller. To support `callMethod` on
query-based builders, `querySelector`/`querySelectorAll`/`getElementById`
gain an optional generic:

```ts
dom.querySelectorAll<EmojiPickerField>("emojiPickers", "emoji-picker-field")
dom.getElementById<HTMLInputElement>("title-input", "titleInput")
```

The runtime behavior is unchanged — the generic only narrows the
`TElement` parameter of the returned `TargetBuilder`.

## Runtime behavior

Both helpers are pure desugaring on top of the existing `domMutate`
effect:

```ts
// classList.add('hidden', 'modal-closing') desugars to:
domMutate({
  targetResourceId,
  fn: element => {
    if (element instanceof Element) {
      element.classList.add("hidden", "modal-closing")
    } else if (isElementList(element)) {
      for (const child of element)
        child.classList.add("hidden", "modal-closing")
    }
  },
})

// callMethod('closePopover', arg) desugars to:
domMutate({
  targetResourceId,
  fn: element => {
    const apply = (node: unknown) => {
      const method = (node as Record<string, unknown>)?.["closePopover"]
      if (typeof method === "function") method.call(node, arg)
    }
    if (isElementList(element)) for (const child of element) apply(child)
    else apply(element)
  },
})
```

`runtimeBrowserModule.ts` requires no changes. Debug logs for `domMutate`
already include the `targetResourceId`; the new helpers may attach a
`label` field to `DomMutateEffectData` for human-readable debug output
(see below).

## Optional: debug labels

To preserve readability in the runtime debug log (currently a `domMutate`
entry shows only the resource id), `DomMutateEffectData` gains an
optional `label` field:

```ts
export type DomMutateEffectData = {
  fn: (element: unknown) => void
  targetResourceId: string
  label?: string // "classList.add(hidden, modal-closing)" | "callMethod(closePopover)"
}
```

`runtimeDebug.ts` is updated to render the label when present. This is
purely additive; existing consumers that pass a hand-written `mutate`
callback continue to work without a label.

## Implementation plan

Work fits in a single PR scoped to `packages/fizz/src/browser/`.

1. **Extend `DomMutateEffectData` with optional `label`.**
   - `domEffects.ts`: add `label?: string` to the type.
   - `runtimeBrowserModule.ts`: no change (label is ignored at execution).
   - `runtimeDebug.ts`: include label in the effect render if present.

2. **Add `ClassListBuilder` factory.**
   - In `domEffects.ts`, define `createClassListBuilder(resourceId, builder)`
     returning the five methods above.
   - Attach it as `classList` inside `createTargetBuilder`.
   - Each method returns `[builder, domMutate({ targetResourceId, fn, label })]`
     where `fn` is the multi-element-aware applicator described above.

3. **Add `callMethod` to `createTargetBuilder`.**
   - Signature: `callMethod(name: string, ...args: unknown[]): Effect<unknown>[]`.
   - Implementation: the multi-element-aware applicator from above.
   - Type signature on the public `TargetBuilder` uses the
     `MethodsOf<TElement>` helper to constrain `name` when `TElement` is
     more specific than `unknown`.

4. **Add generic to query helpers in `DomFromBuilder`.**
   - Each of `closest`, `getElementById`, `getElementsByClassName`,
     `getElementsByName`, `getElementsByTagName`, `querySelector`,
     `querySelectorAll` accepts an optional generic `<TElement extends Element>`
     that flows into the returned `TargetBuilder`.
   - History/Location builders are unaffected (they remain typed
     to `History` / `Location`).

5. **Tests.** In `packages/fizz/src/__tests__/domEffects.spec.ts`:
   - `.classList.add/remove/toggle/replace/set` each emit a `domAcquire`
     plus a `domMutate` whose `fn` applies the expected class operation
     to a stub element.
   - `.classList.*` applied to a `querySelectorAll` resource applies the
     mutation to each element in a stub list.
   - `.callMethod` invokes the named method with arguments on a stub
     element and skips elements lacking the method.
   - Type-level: an `expectType` assertion verifies that
     `dom.fromElement<HTMLInputElement>(...).callMethod('focus')` compiles
     and `.callMethod('nonExistent')` does not.

6. **Runtime integration test.** In
   `packages/fizz/src/__tests__/runtimeBrowserModule.spec.ts`, extend the
   existing `domMutate` test with two cases: one using the `classList`
   helper, one using `callMethod`. Both should observe the side effect
   on real (jsdom) elements.

7. **Docs.** Add a short section to `docs/` covering the new helpers
   and the recommendation: prefer `classList` and `callMethod` over
   `mutate` whenever the intent fits, and reserve `mutate` for true
   one-off DOM tweaks. Mention the generic on `querySelector*` for
   web-component method calls.

8. **Changeset.** Minor bump on `@tdreyno/fizz` (additive API).

## Migration

No breaking changes. Existing `mutate`-based call sites continue to work.
A follow-up codemod (out of scope for this PR) could rewrite mechanical
`mutate(el => el.classList.add(...))` patterns to `.classList.add(...)`.

## Risks

- **API surface growth on the builder.** `classList` adds a fifth top-
  level property to every `TargetBuilder`. Mitigated by namespacing under
  a single `classList` object that mirrors a well-known DOM API.
- **Method-name typing footgun.** When consumers do not parameterize the
  query, `callMethod('whatever')` accepts any string. The runtime guard
  prevents crashes but the call silently no-ops. The docs should call
  this out and steer consumers to provide a generic when calling web-
  component methods.
- **Multi-element semantics differ from native DOM.** `.classList` on a
  `querySelectorAll` builder applies to every element; native DOM has no
  `NodeList.classList`. This matches existing `mutate` semantics on
  multi-element resources, but it is worth a docs note.

## Future work

These follow the same shape as `classList` and can ship in later PRs
once this proposal lands:

- `.attr.set(name, value)` / `.attr.remove(name)` / `.attr.toggle(name)`.
- `.dataset.set(key, value)` / `.dataset.remove(key)`.
- `.style.set(property, value)` / `.style.remove(property)`.
- `.text(value)` for `textContent` updates.

Each is a thin desugaring over `domMutate`, optionally with a `label`
for debug output, exactly like the helpers proposed here.
