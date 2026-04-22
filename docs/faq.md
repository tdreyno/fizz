# FAQ

This page collects short answers to practical questions that come up around Fizz adoption and day-to-day usage.

Use the dedicated guides for the full mental model, API details, and framework walkthroughs. The FAQ is for the smaller questions that do not need their own page.

## Can I use Fizz without a framework?

Yes. `@tdreyno/fizz` is the core runtime and does not require React or any other UI framework.

You can create a context, create a runtime, and run actions directly from application code. The framework packages are integration layers on top of the core runtime, not a requirement for using it.

Start with [Getting Started](./getting-started.md) for the runtime shape. If you are using React, see [React Integration](./react-integration.md).

## Do I need the AI skill to use Fizz?

No. The AI skill is optional and only exists to help compatible coding agents recognize and apply Fizz patterns.

It is not required to install, run, test, or ship a Fizz machine. If you never use an agent workflow, you can ignore it entirely.

See [AI Skills](./ai-skills.md) for the exact scope.

## How do I debug state machine transitions?

Start by keeping the machine logic explicit and inspecting transitions at the runtime boundary instead of scattering `console.log(...)` calls across callbacks.

In practice, the most useful progression is:

- inspect `currentState`
- watch `runtime.onContextChange(...)`
- watch `runtime.onOutput(...)`
- attach a structured runtime monitor when you need async, timer, interval, or frame lifecycle visibility

See [Debugging](./debugging.md) for the current Node and browser debugging patterns, and [Architecture](./architecture.md) for the transition model itself.

## What happens to timers and intervals when I leave a state?

They belong to the lifetime of the current state instance.

That means scheduled work started by a state is cleaned up when that state instance is replaced, which helps prevent stale completions and orphaned background behavior from leaking into later workflow steps.

See [Timers](./timers.md) and [Intervals](./intervals.md) for the full lifecycle details.

## How do I save or restore machine state between sessions?

Treat persistence as an application concern around the machine, not as a separate Fizz runtime mode.

In practice, persist the machine-owned data you care about, then re-enter the runtime with the bound state and data you want to restore. Keep the persisted shape intentional rather than trying to serialize every runtime detail blindly.

## How do I share data between a parent state and a nested machine?

Keep the boundary explicit. The parent should own the larger workflow, and the child should own a smaller local flow with a clear handoff.

Parent-to-child communication usually happens by forwarding a small set of actions. Child-to-parent communication should stay milestone-oriented, such as completed, cancelled, or needs retry, instead of turning into constant back-and-forth chatter.

See [Nested State Machines](./nested-state-machines.md) for the parent and child runtime shape.

## How do I handle errors from async requests?

Model them as explicit actions and states instead of treating them as incidental callback failures.

That usually means mapping a rejected async operation to a failure action, then deciding in the machine whether to retry, show an error, fall back, or transition to a dedicated failed state. This keeps request failure behavior visible in the same place as the success path.

See [Async](./async.md) for the request and cancellation flow.

## What is the difference between `output(...)` and an effect?

Use `output(...)` when the machine wants to tell another layer that something happened. Use an effect when the runtime itself should perform work after the transition is chosen.

That distinction matters because outputs are integration-facing signals, while effects represent work the runtime executes. If the machine is notifying the outside world, prefer output. If the runtime should perform the work, prefer an effect.

See [Architecture](./architecture.md) and [Custom Effects](./custom-effects.md).

## Can I use Fizz with form libraries?

Yes, but keep responsibilities separate.

Let the form library handle field registration, browser events, and validation ergonomics. Let the machine handle workflow state, submission steps, async status, retry behavior, and larger transitions between modes. If the machine starts mirroring every field-level concern, the boundary is probably too blurry.

## Is Fizz suitable for production applications?

Yes, when the problem actually benefits from explicit workflow modeling.

Fizz is strongest when an application has meaningful states, event-driven transitions, async work, timers, or nested flows that become hard to reason about once they are spread across ad hoc component logic. If the problem is simple local state with no workflow complexity, a lighter abstraction may be enough.

## How does Fizz compare to Redux, Zustand, or XState?

Fizz is aimed at explicit state-machine workflows rather than being a general-purpose store or a broad app architecture layer.

Compared with Redux or Zustand, Fizz leans harder into named states and transition modeling. Compared with XState, it stays relatively small and direct, with a runtime centered on explicit state handlers, actions, outputs, and effects. The right choice depends on whether your main problem is shared data storage or workflow control.

## Related Docs

- [Getting Started](./getting-started.md)
- [Choosing The Right Scale](./choosing-scale.md)
- [Architecture](./architecture.md)
- [Debugging](./debugging.md)
- [React Integration](./react-integration.md)
- [Nested State Machines](./nested-state-machines.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [Custom Effects](./custom-effects.md)
- [API](./api.md)
