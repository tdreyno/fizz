# Upstream Feature Request: Align Fizz Runtime APIs With Large App Integration Needs

## Summary
This proposal requests six additive API improvements to better support production apps with nested machines, controller-heavy integration, and safety-critical guard routing.

The changes are based on concrete friction observed while planning adoption in a real Fizz consumer app (`japan`). They are designed to be backward-compatible and incremental.

## Motivation
The current APIs are strong, but a few ergonomics and observability gaps increase integration complexity in non-React, runtime-centric applications:

1. Nested state transitions are not emitted as first-class transition events at the parent runtime level.
2. Selectors exist but there is no selector subscription primitive for runtime/controller code.
3. Selector non-match behavior can return mixed `false`/`undefined` shapes depending on selector kind.
4. `route()` silently no-ops when no branch matches, which can hide logic regressions.
5. Route metadata is useful, but lacks stable branch identifiers for resilient tests/tooling.
6. `stateWithNested()` forwarding is all-or-nothing and hard to customize.

## Goals
1. Improve observability for nested machine composition.
2. Reduce boilerplate in controller integration code.
3. Improve safety and debuggability for ordered guard routing.
4. Preserve existing runtime semantics unless users opt into new behavior.

## Non-Goals
1. Rewrite current APIs.
2. Require migration for existing apps.
3. Introduce breaking changes in `route()`, selectors, or nested runtime behavior.

## Proposal

### 1) Transition Path Events (`onPathTransition`)
Add a path-aware transition subscription that emits when either top-level state name changes or nested child path changes.

#### API
```ts
type TransitionEvent = {
  action: Action | undefined;
  previousState: StateTransition | undefined;
  state: StateTransition;
};

type PathTransitionEvent = TransitionEvent & {
  previousPath: string;
  path: string;
};

runtime.onPathTransition(
  (event: PathTransitionEvent) => void,
  options?: { separator?: string }
): () => void;
```

#### Notes
1. `onTransition` remains unchanged for backward compatibility.
2. `onPathTransition` compares `runtime.currentStatePath()` values.

---

### 2) Selector Subscription (`subscribeSelector`)
Add runtime-native selector subscriptions with memoized equality.

#### API
```ts
runtime.subscribeSelector<T>(
  selector: StateSelectorLike<T>,
  listener: (next: T, prev: T | undefined) => void,
  options?: {
    equalityFn?: (a: T, b: T) => boolean;
    emitInitial?: boolean;
  }
): () => void;
```

#### Notes
1. Should evaluate on every context change.
2. Should call listener only when selection changes by `equalityFn`.
3. Supports `selectWhen(...)` selectors and direct selector functions.

---

### 3) Explicit Selector Defaults (`defaultValue`)
Normalize non-match behavior for selectors.

#### API
```ts
selectWhen(when, selectOrMatcher, {
  equalityFn?,
  defaultValue?
});
```

#### Semantics
1. If selector does not match current state, return `defaultValue` when provided.
2. If not provided, preserve current behavior (backward compatible).

---

### 4) Strict Route Mode (`route({ strict })`)
Add opt-in strict behavior for guard chains.

#### API
```ts
route({
  strict?: boolean,
  onUnmatched?: "warn" | "throw" | ((ctx) => void)
})
```

#### Semantics
1. Default behavior remains current no-op.
2. In strict mode:
1. If no branch matches and no `.otherwise(...)` exists, trigger `onUnmatched`.
2. `onUnmatched: "throw"` throws runtime error with action/state context.
3. `onUnmatched: "warn"` emits monitor warning with route metadata.

---

### 5) Stable Route Metadata IDs
Extend `getRouteMetadata` with stable branch identifiers.

#### API (metadata shape extension)
```ts
type RouteBranchMetadata = {
  id: string;          // required stable id
  label: string;
  index: number;
  otherwise: boolean;
};
```

#### Builder support
```ts
route()
  .when(predicate, target, { id: "close-user-menu", label: "Close User Menu" })
  .otherwise(target, { id: "fallback" });
```

#### Notes
1. `id` should be required in strict metadata mode, optional otherwise.
2. Enables robust tests and route visualizers without brittle snapshots.

---

### 6) Configurable Nested Forwarding (`stateWithNested`)
Allow selective forwarding and payload mapping.

#### API extension
```ts
stateWithNested(handlers, initialNestedState, nestedActions, {
  name?,
  forward?: "all" | "none" | string[],
  mapPayload?: Record<string, (payload, parentData) => unknown>,
  beforeForward?: (actionType, payload, data) => void,
  afterForward?: (actionType, payload, data) => void,
});
```

#### Notes
1. Default remains equivalent to current behavior (`forward: "all"`).
2. `forward: string[]` allows explicit action whitelist.
3. `mapPayload` supports parent->child payload shaping without extra boilerplate handlers.

## Example: Why This Matters
A modal machine with nested child states and external controller logic needs:

1. Path-level transition logs (`Closed -> Interactable/Opening -> Interactable/Open`).
2. Controller subscriptions to derived booleans (isOpen, isFormRenderable).
3. Strict guard routing for Escape key and close behavior.
4. Test-stable metadata for branch ordering.

Without the proposals above, consumers rely on manual `onContextChange` wiring, duplicated predicates, and custom guard diagnostics.

## Backward Compatibility
All proposed changes are additive and opt-in.

1. Existing code paths continue to behave exactly as today.
2. New strict/metadata features activate only when explicitly configured.
3. Existing `onTransition`, `selectWhen`, `route()`, and `stateWithNested()` signatures remain valid.

## Acceptance Criteria
1. New APIs ship with type definitions and docs.
2. Existing test suite remains green without consumer changes.
3. New tests verify:
1. `onPathTransition` fires on nested path changes.
2. `subscribeSelector` respects equality and emitInitial.
3. `selectWhen defaultValue` behavior.
4. strict `route()` unmatched behavior.
5. metadata includes stable branch ids.
6. nested forwarding config works for all/none/allowlist modes.

## Suggested Rollout
1. Phase 1: `onPathTransition`, `subscribeSelector`, selector defaults.
2. Phase 2: strict route mode + metadata ids.
3. Phase 3: configurable nested forwarding.

## Open Questions
1. Should strict route mode also enforce `.otherwise(...)` at build time (dev-only)?
2. Should `subscribeSelector` support async listeners, or keep sync-only semantics?
3. Should route branch `id` be globally unique per handler or just unique per route definition?

## Request
If maintainers agree, I can submit this as:

1. A formal GitHub issue with phased milestones.
2. A follow-up implementation plan mapped to package/module boundaries.
3. A draft PR for Phase 1 only (lowest risk, highest immediate ROI).
