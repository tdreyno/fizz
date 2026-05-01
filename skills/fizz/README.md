# Fizz AI Skill

This repository now ships a skills.sh-compatible agent skill for working with Fizz state machines and the React integration.

## Install

Install the skill from the repository root with:

```bash
npx skills add tdreyno/fizz
```

## What It Covers

- `@tdreyno/fizz` runtime setup and state-machine modeling
- `@tdreyno/fizz` machine construction with `createMachine(...)`
- `@tdreyno/fizz` async, timers, intervals, and cancellation helpers
- `@tdreyno/fizz` `debounce(...)` and `throttle(...)` handler wrappers
- `@tdreyno/fizz` state helpers such as `switch_(...)`, `whichTimeout(...)`, `whichInterval(...)`, `waitState(...)`, and `isStateTransition(...)`
- `@tdreyno/fizz` testing guidance for controlled drivers and deterministic runtime tests
- `@tdreyno/fizz-react` integration through `useMachine(...)` and `createMachineContext(...)`

## What It Excludes

- Example-app specific guidance from `react-example/`
- Generic non-Fizz state-management advice

## Structure

```text
skills/fizz/
  SKILL.md
  README.md
  references/
    async-and-scheduling.md
    core-runtime.md
    resources.md
    examples.md
    fluent-api.md
    react-integration.md
    testing.md
```

`SKILL.md` is the trigger surface and short working guide. The files in `references/` are deeper, on-demand material for agents that need more detail.

## References

- `skills/fizz/SKILL.md`
- `skills/fizz/references/core-runtime.md`
- `skills/fizz/references/async-and-scheduling.md`
- `skills/fizz/references/resources.md`
- `skills/fizz/references/testing.md`
- `skills/fizz/references/react-integration.md`
- `skills/fizz/references/examples.md`
- `skills/fizz/references/fluent-api.md`
