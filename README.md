# Fizz

[![npm latest version](https://img.shields.io/npm/v/@tdreyno/fizz/latest.svg)](https://www.npmjs.com/package/@tdreyno/fizz)

Fizz is a small library for building state machines that can effectively manage complex sequences of events. [Learn more about state machines (and charts).](https://statecharts.github.io)

## Install

```bash
npm install --save @tdreyno/fizz
```

Start with [Getting Started](./docs/getting-started.md) for installation, a minimal runtime demo, and where to go next.

See [React Integration](./docs/react-integration.md) if you are using `@tdreyno/fizz-react` and want the full `useMachine(...)` guide.

Read [Architecture](./docs/architecture.md) for the core model behind states, actions, transitions, outputs, and effects.

## AI Skills

Fizz also ships an installable agent skill for `@tdreyno/fizz` and `@tdreyno/fizz-react` via [skills.sh](https://skills.sh/).

```bash
npx skills add tdreyno/fizz
```

See [AI Skills](./docs/ai-skills.md) for scope, usage, and what the skill teaches agents.

See [Testing](./docs/testing.md) for the current recommended Fizz testing workflow and the planned dedicated testing entrypoint.

See [Custom Effects](./docs/custom-effects.md) for the low-level `effect(...)` API and [Complex Actions](./docs/complex-actions.md) for larger handler patterns.

See the [Fizz Package README](./packages/fizz/README.md) for more details and examples.
