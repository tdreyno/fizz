# Fizz Proposal: Fluent Multi-Listener DOM Chains

## Problem

Current DOM listener APIs produce tuples or one-off listener chains, which makes this common pattern awkward:

- one resource
- multiple listeners on the same element
- per-listener fluent mapping
- readable linear composition

Today this often requires tuple indexing or duplicated builder calls.

## Desired Authoring Style

The target style should work as a single fluent chain:

```ts
dom
  .fromElement(data.input, INPUT_RESOURCE)
  .onFocus(() => focused())
  .onInput()
  .mapEvent(event => event?.target?.value || "")
  .chainToAction(value => inputChanged({ value }))
  .onChange()
  .mapEvent(event => event?.target?.value || "")
  .chainToAction(value => changed({ value }))
  .onBlur(() => blurred())
```

## Proposed Breaking API

### 1) Resource Builder Returns a Composable Chain Object

Change dom resource builders to return a composable object rather than tuple-first effects.

New core shape:

- `DomChainBuilder`
- `ListenerChainBuilder`

Conceptually:

- `DomChainBuilder` owns one acquisition scope (resource id and target)
- listener calls append steps to the same chain
- the chain is directly returnable from a state handler as one effect value

### 2) Listener Methods Become Chain-Preserving

On `DomChainBuilder`:

- `onFocus(handler, options?)` returns `DomChainBuilder`
- `onBlur(handler, options?)` returns `DomChainBuilder`
- `onInput(handler, options?)` returns `DomChainBuilder`
- `onChange(handler, options?)` returns `DomChainBuilder`

And overloads for mapper form:

- `onInput(options?)` returns `ListenerChainBuilder`
- `onChange(options?)` returns `ListenerChainBuilder`

On `ListenerChainBuilder`:

- `mapEvent(fn)`
- `when(predicate)`
- `preventDefault()`
- `stopPropagation()`
- `chainToAction(onMatch, onNoMatch?)` returns `DomChainBuilder`

This allows returning to the base chain after each action binding.

### 3) Chain as a First-Class Effect

Introduce one runtime-level effect kind for composed DOM chains.

Example internal payload fields:

- acquire: singleton/query/external config
- listeners: ordered list of listener descriptors
- mutations: optional list of mutate/setValue/setProperty steps

Runtime behavior:

1. acquire resource once
2. register all listeners for that chain
3. teardown all listeners on state exit
4. preserve listener order of declaration

### 4) Keep Existing APIs Only in Legacy Entry Point

Because this is a breaking proposal:

- new default exports use chain-first behavior
- existing tuple APIs move to compatibility entry point, for example:
  - `@tdreyno/fizz/browser/legacy`

This keeps migration explicit and avoids silent behavior shifts.

## Type System Contract

### DomChainBuilder should be returnable from handlers

Handler return types should accept:

- Effect
- Action
- State transition
- DomChainBuilder
- arrays of the above

### Listener mapping should preserve event typing

ListenerChainBuilder generic parameters:

- Target element type
- Event type
- Current mapped value type

`chainToAction` should use mapped type for strong action payload inference.

## Runtime Semantics

### Ordering

Declaration order should be deterministic:

- listeners execute in chain declaration order by default
- preserve existing order option behavior where provided

### Coalescing

Per-listener coalescing remains local to each listener descriptor.

### Resource Sharing

All listeners in one `DomChainBuilder` share a single acquire operation by design.

### Teardown

All listeners in the chain are torn down together using the same state lifecycle boundary as current `dom.listen` behavior.

## Additional DX Zones (All In Same Release)

In the same release, ship plain-object single-return shorthand for same-state updates across these zones:

1. Fluent state callbacks
2. Timer and interval handlers
3. Async success and failure mapping handlers
4. Browser and DOM event handlers
5. Learning surfaces (docs and skill references)

This keeps authoring consistent: simple data-mapping handlers can return next data directly.

## Shorthand Guardrails

To avoid ambiguity, keep these boundaries:

1. Same-state shorthand only
2. No shorthand for array data states
3. No shorthand interpretation inside top-level returned handler arrays
4. Explicit `update(...)` remains fully supported everywhere

## Implementation Scope: All At Once

This proposal intentionally ships all listed DX zones in one coordinated rollout:

1. One runtime/type normalization change
2. Cross-zone tests in fluent, async/scheduling, timers/intervals, and browser/dom
3. Docs + skill reference updates in the same change
4. One release note covering feature scope and guardrails

## Migration Guidance

### Before

- repeated `dom.fromElement` calls
- or tuple indexing
- repetitive `update(...)` wrappers in simple data-mapping handlers

### After

- one fluent chain per element resource
- plain-object single returns for happy-path same-state updates

Recommended codemod steps:

1. detect repeated `dom.fromElement(element, resourceId)` within same returned effect array
2. convert to single fluent chain
3. fold tuple index access into direct chain methods
4. preserve options and predicates per listener

## Optional Companion APIs

If maintainers want a staged path, add these in same release:

- `resource.withListeners(on => on.focus(...).input(...).change(...))`
- `resource.listener(type).mapEvent(...).chainToAction(...)`

These are optional if the direct chain API above lands.

## Why This Helps Autocomplete

Autocomplete UIs frequently need:

- focus to seed token/session
- input to debounce query
- change to select exact match
- blur to cancel/reset

A chain-first API maps directly to that mental model and avoids structural boilerplate.

## Recommendation

Adopt the breaking chain-first DOM API and the cross-zone plain-object shorthand in the next major Fizz version, while keeping current tuple semantics only in a legacy import path.
