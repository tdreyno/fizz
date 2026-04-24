# AI Skills

Fizz ships an installable agent skill for the core runtime and the React integration.

This skill is optimized for agents, not as a replacement for the normal API docs. Its job is to help coding agents recognize when a task should use Fizz patterns and then apply the library consistently.

## Install

Install the skill from [skills.sh](https://skills.sh/) with:

```bash
npx skills add tdreyno/fizz
```

## What The Skill Covers

- Core `@tdreyno/fizz` state-machine modeling
- Core selectors with `selectWhen(...)` colocated on `createMachine(...)`
- Optional fluent state authoring with `@tdreyno/fizz/fluent`
- Runtime setup with `createMachine(...)`, `createRuntime(machine, initialState, options?)`, and `enter()`
- Async and scheduling helpers such as `startAsync(...)`, `requestJSONAsync(...)`, timers, intervals, and frame-based work
- Browser runtime driver setup with `browserDriver` from `@tdreyno/fizz/browser`
- Browser effect helpers such as `confirm(...)`, `prompt(...)`, `alert(...)`, `copyToClipboard(...)`, and navigation helpers
- React integration through `@tdreyno/fizz-react` and `useMachine(...)`

Selectors are not limited to React usage. Agents should treat them as machine-level derived checks that can be consumed through React integrations or evaluated directly in core runtime flows.

## Scope Boundaries

The published skill intentionally focuses on:

- `@tdreyno/fizz`
- `@tdreyno/fizz-react`

It intentionally excludes:

- application-specific patterns from `react-example/`
- general non-Fizz architecture advice

## How Agents Should Use It

Agents should reach for this skill when a task involves:

- creating or refactoring a Fizz machine
- reviewing Fizz transitions, actions, or effects
- wiring a runtime correctly
- adding async request flows or scheduled behavior
- writing or reviewing tests for Fizz machines and runtimes
- integrating an existing machine into React with `useMachine(...)`
- modeling browser-confirmation flows with dedicated states and built-in actions (`ConfirmAccepted`, `ConfirmRejected`, `PromptSubmitted`, `PromptCancelled`)
- wiring browser behavior through runtime driver options instead of ad-hoc direct browser calls in state handlers

The skill keeps the top-level guidance short and points agents to deeper reference files only when they need more detail.

## What Users Should Expect

After the skill is installed, compatible agents can use it automatically when a task matches the Fizz domain. In practice that means the agent should:

- model workflows with explicit Fizz states and actions
- preserve the runtime lifecycle Fizz expects
- use the built-in async and scheduling helpers instead of ad-hoc alternatives
- treat `confirm(...)` and `prompt(...)` as runtime-owned request/response primitives
- use one-way browser effects (`alert`, copy, open, print, location/history/postMessage) for fire-and-forget behavior
- prefer controlled runtime drivers for deterministic async and timer tests
- keep React components thin when a Fizz machine is already the source of truth

## Related Docs

- [Introduction](../README.md)
- [Getting Started](./getting-started.md)
- [React Integration](./react-integration.md)
- [Architecture](./architecture.md)
- [Complex Actions](./complex-actions.md)
- [Testing](./testing.md)
- [Async](./async.md)
- [API](./api.md)
- [Custom Effects](./custom-effects.md)
