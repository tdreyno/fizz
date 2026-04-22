---
name: fizz
description: Fizz state machine modeling and testing guidance for the @tdreyno/fizz runtime and @tdreyno/fizz-react integration APIs. Use this skill when designing or refactoring Fizz machines, wiring createMachine/createRuntime/createInitialContext, modeling async and scheduled transitions, writing or reviewing Fizz tests, reviewing action and effect flows, or integrating a machine with useMachine or createMachineContext in React.
license: Hippocratic-2.1
metadata:
  author: tdreyno
  version: "1.0.0"
---

# Fizz AI Skill

Agent-oriented guidance for working with Fizz state machines and the React integration.

## When to Use This Skill

Use this skill when the task involves:

- Modeling a workflow as Fizz states, transitions, actions, or effects
- Creating or refactoring a machine/runtime with `createMachine(...)`, `createInitialContext(...)`, `createRuntime(...)`, or `enter()`
- Designing or reviewing parallel composition with `createParallelMachine(...)` and `getParallelRuntimes(...)`
- Adding async work with `startAsync(...)`, `requestJSONAsync(...)`, or `customJSONAsync(...)`
- Adding timers, intervals, or frame-driven behavior from a state handler
- Debouncing or throttling high-frequency handlers with `debounce(...)` and `throttle(...)`
- Using state helper APIs like `switch_(...)`, `whichTimeout(...)`, `whichInterval(...)`, `waitState(...)`, or `isStateTransition(...)`
- Using the optional fluent entry point `@tdreyno/fizz/fluent` for chain-first state authoring
- Writing or reviewing deterministic tests for Fizz machines or runtimes
- Debugging stale async completions, cancellation, or state-entry behavior
- Integrating a Fizz machine into React with `useMachine(...)` or `createMachineContext(...)`
- Reviewing Fizz or fizz-react code for correctness, predictability, or API usage

## Scope

This skill covers:

- `@tdreyno/fizz`
- `@tdreyno/fizz-react`

This skill does not cover:

- Next.js or app-specific patterns from `react-example/`
- Generic state machine theory that is not grounded in the Fizz APIs in this repository

## Quick Reference

### 1. Model explicit state transitions first

Prefer named actions and explicit state handlers over hidden control flow. Fizz works best when each state clearly maps accepted actions to the next transition or effect.

### 2. Keep handlers deterministic

State handlers should describe transitions and effects. Avoid burying side effects directly inside handler logic when an explicit `Effect` or async helper is a better fit.

### 3. Start runtimes the Fizz way

Create the initial context, create the runtime, then run `enter()` to bootstrap the machine.

### 4. Use async helpers instead of ad-hoc fetch orchestration

Use `startAsync(...)` for generic promise-backed work. Use `requestJSONAsync(...)` for JSON fetch flows. Use `customJSONAsync(...)` when app client functions already return parsed JSON. Use `validate(...)` to narrow payloads with assert-style or parser-style validators, use `map(...)` for payload shaping, and use `chainToAction(...)` when the result should dispatch actions.

### 5. Treat cancellation and stale completions as part of the design

If async work may outlive the current state instance, give it an explicit `asyncId` and decide whether the state should react to `AsyncCancelled`.

### 6. Keep React integration thin

`useMachine(...)` should host a Fizz machine, not replace it. Put state modeling in Fizz states and keep React components focused on rendering and dispatching actions.

## Working Rules

### Core modeling

- Use `state(...)` for flat state definitions and `stateWithNested(...)` when the machine genuinely needs nested state composition.
- Use `createParallelMachine(...)` when several child workflows should stay active together and shared actions should fan out across branches.
- Use `@tdreyno/fizz/fluent` when a task explicitly prefers creator-first chained responder registration.
- Use `switch_(...)`, `whichTimeout(...)`, and `whichInterval(...)` to keep state branching explicit and exhaustive.
- Use `waitState(...)` for request-on-enter and response-driven transition flows.
- Use named actions created up front and wire them into the runtime action map.
- Return transitions, actions, and effects from handlers instead of mutating external systems directly.
- Favor small, readable state handlers over dense helper indirection.

### Runtime lifecycle

Follow this sequence when wiring a machine manually:

1. Define the states and action creators.
2. Create the initial context with the initial state transition.
3. Create the runtime with runtime actions and any output actions.
4. Run `enter()`.

If the task is about runtime behavior, read `references/core-runtime.md`.

### Async and scheduling

- Use `startAsync(...)` when the async source is not just `fetch(...).json()`.
- Use `requestJSONAsync(...)` when fetching JSON from an API.
- Use `customJSONAsync(...)` when using app-level client methods (OpenAPI, Apollo, or similar) that already return parsed JSON.
- Use `debounce(...)` when a handler should run after calls quiet down for a delay window.
- Use `throttle(...)` when a handler should run at most once per window.
- Call `validate(...)` before `chainToAction(...)` if the payload must be checked or narrowed.
- Use `map(...)` before `chainToAction(...)` when payload shape conversion should stay inside the async pipeline.
- Use explicit ids for timers, intervals, and async work when later cancellation matters.
- Design handlers for `AsyncCancelled`, `TimerCompleted`, `IntervalTriggered`, or related scheduled actions only when the machine needs to respond to them.

If the task is about request flows, cancellation, or timing, read `references/async-and-scheduling.md`.

### Testing

- Prefer deterministic tests that drive the real runtime with controlled drivers.
- Use `createControlledAsyncDriver()` for promise-backed work.
- Use `createControlledTimerDriver()` for timers, intervals, and frames.
- Assert state identity, machine-visible data, and emitted outputs before reaching for lower-level runtime details.
- Use the `@tdreyno/fizz/test` entrypoint when a task needs reusable Fizz testing helpers.

If the task is about machine tests or consumer-facing test helpers, read `references/testing.md`.

### React usage

- Use `useMachine(...)` to bind an existing Fizz machine into React.
- Use `createMachineContext(...)` when multiple components should share one machine instance through a Provider.
- Keep machine definition and transition logic outside the React component body when possible.
- Treat the hook as an adapter that exposes `currentState`, `states`, `context`, `actions`, and `runtime`.
- Compare states with `currentState.is(machine.states.SomeState)`.
- Avoid shifting business logic from the machine into component-local React state unless the task explicitly requires it.

If the task is about React integration, read `references/react-integration.md`.

## Suggested Workflow

1. Identify whether the task is core runtime work, async/scheduling work, testing work, or React integration work.
2. Read the matching reference file before making changes.
3. Preserve the existing public API unless the task explicitly asks for a change.
4. When changing behavior, prefer updating or adding behavior-focused tests in the touched package.
5. Keep examples and docs aligned with the real exported APIs from this repository.

## Reference Files

- `references/core-runtime.md` for states, actions, helper matchers, effects, runtime setup, and nested machines
- `references/parallel-state-machines.md` for `createParallelMachine(...)`, branch broadcasting, lifecycle, and branch runtime inspection
- `references/async-and-scheduling.md` for `startAsync(...)`, `requestJSONAsync(...)`, `customJSONAsync(...)`, `debounce(...)`, `throttle(...)`, cancellation, timers, intervals, and frames
- `references/testing.md` for deterministic machine testing, controlled drivers, and the `@tdreyno/fizz/test` subpath
- `references/react-integration.md` for `useMachine(...)`, `createMachineContext(...)`, and React-specific guidance
- `references/examples.md` for short copyable usage patterns
- `references/fluent-api.md` for the optional fluent state authoring entry point

## Source Anchors

Use these repository files as the source of truth when answering implementation questions:

- `packages/fizz/src/index.ts`
- `packages/fizz/src/createMachine.ts`
- `packages/fizz/src/state.ts`
- `packages/fizz/src/effect.ts`
- `packages/fizz/src/runtime.ts`
- `packages/fizz-react/src/index.ts`
- `packages/fizz-react/src/createMachineContext.ts`
- `packages/fizz-react/src/useMachine.ts`
- `docs/testing.md`
- `docs/async.md`
- `packages/fizz/README.md`
