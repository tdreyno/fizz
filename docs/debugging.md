# Debugging

Fizz debugging works best when you inspect the runtime at the same boundary where the machine makes decisions.

That means starting with explicit state names, current state data, output actions, and scheduler lifecycle events instead of sprinkling ad hoc `console.log(...)` calls across callbacks.

This page covers the current runtime debugging tools in `@tdreyno/fizz`, with examples for Node.js runtimes and browser runtimes.

If you want a dedicated DevTools workflow for browser machines, read [Chrome Debugger](./chrome-debugger.md). That guide covers the zero-config extension setup, panel workflow, and current browser-specific limitations.

## The current debugging surfaces

Fizz exposes a few different layers of runtime visibility:

- `runtime.currentState()` when you need the current state right now
- `runtime.onContextChange(...)` when you want to observe state transitions over time
- `runtime.onOutput(...)` when you want to see machine-emitted integration actions
- `RuntimeOptions.monitor` when you want structured runtime lifecycle events
- `createRuntimeConsoleMonitor(...)` when you want those lifecycle events written to a console
- `formatRuntimeDebugEvent(...)` when you want to route lifecycle events into your own logger

The structured monitor is the most complete option because it covers action queueing, command execution, context changes, async work, timers, intervals, frames, outputs, and runtime errors.

## Start simple

Before attaching a full runtime monitor, start with the smallest thing that will answer the debugging question.

- If you only need to know where the machine is now, inspect `runtime.currentState()`.
- If you need to confirm a transition sequence, subscribe with `runtime.onContextChange(...)`.
- If you need to see what the machine is telling the outside world, subscribe with `runtime.onOutput(...)`.
- If you need scheduler and lifecycle visibility, attach `monitor: createRuntimeConsoleMonitor(...)`.

That keeps the debugging surface intentional instead of turning every investigation into raw console noise.

## Node runtime example

In a Node.js runtime, attach the console monitor directly when you create the runtime.

```ts
import {
  action,
  createMachine,
  createRuntime,
  createRuntimeConsoleMonitor,
  enter,
  state,
} from "@tdreyno/fizz"

const loadOrder = action("LoadOrder")

type Data = {
  orderId: string
}

const Idle = state(
  {
    Enter: (data, _, { update }) => update(data),
    LoadOrder: (data, _, { update }) =>
      update({
        ...data,
      }),
  },
  { name: "Idle" },
)

const OrdersMachine = createMachine({
  actions: { loadOrder },
  states: { Idle },
})

const runtime = createRuntime(OrdersMachine, Idle({ orderId: "o-1" }), {
  monitor: createRuntimeConsoleMonitor({
    prefix: "[Orders]",
  }),
})

await runtime.run(enter())
await runtime.run(loadOrder())
```

That will write readable lifecycle entries such as:

```text
[Orders] Enqueue action LoadOrder { payload: undefined, queueSize: 1 }
[Orders] Start action LoadOrder { queueSize: 1 }
[Orders] Context Idle -> Idle { currentState: ..., previousState: ... }
[Orders] Complete action LoadOrder { generatedCommands: [...] }
```

This is the best starting point for CLI tools, workers, Node services, and test-only repro scripts.

## Browser runtime example

For browser runtimes that create the Fizz runtime directly, the same monitor works and logs to the browser DevTools console.

```ts
import {
  action,
  createMachine,
  createRuntime,
  createRuntimeConsoleMonitor,
  enter,
  state,
} from "@tdreyno/fizz"

const arm = action("Arm")
const cancel = action("Cancel")

type Data = {
  status: "idle" | "armed"
}

const TimeoutDemo = state(
  {
    Enter: (data, _, { update }) => update(data),
    Arm: (data, _, { update }) =>
      update({
        ...data,
        status: "armed",
      }),
    Cancel: (data, _, { update }) =>
      update({
        ...data,
        status: "idle",
      }),
  },
  { name: "TimeoutDemo" },
)

const TimeoutMachine = createMachine({
  actions: { arm, cancel },
  states: { TimeoutDemo },
})

const runtime = createRuntime(
  TimeoutMachine,
  TimeoutDemo({
    status: "idle",
  }),
  {
    monitor: createRuntimeConsoleMonitor({
      prefix: "[TimeoutDemo]",
    }),
  },
)

await runtime.run(enter())

document
  .querySelector("#arm")
  ?.addEventListener("click", () => void runtime.run(arm()))

document
  .querySelector("#cancel")
  ?.addEventListener("click", () => void runtime.run(cancel()))
```

In the browser, the main difference is where you read the logs, not how you attach the monitor. The same runtime events are available.

## React browser guidance today

If you are using `useMachine(...)`, the hook returns `runtime`, which lets you inspect the hosted runtime after mount.

The current hook implementation does not yet accept runtime `monitor` options, so the browser-first debugging pattern today is:

- inspect `machine.currentState`
- subscribe to `machine.runtime?.onContextChange(...)`
- subscribe to `machine.runtime?.onOutput(...)`
- use a directly created runtime when you specifically need full monitor events in the browser

For example:

```tsx
import { useEffect } from "react"

const TimeoutPanel = () => {
  const machine = useTimeoutMachine()

  useEffect(() => {
    if (!machine.runtime) {
      return
    }

    const stopContext = machine.runtime.onContextChange(context => {
      console.log(
        "[TimeoutDemo] state",
        context.currentState.name,
        context.currentState,
      )
    })

    const stopOutput = machine.runtime.onOutput(action => {
      console.log("[TimeoutDemo] output", action.type, action)
    })

    return () => {
      stopContext()
      stopOutput()
    }
  }, [machine.runtime])

  return <div>{machine.currentState.name}</div>
}
```

That keeps browser debugging console-only for now while still giving components a clear path to inspect transitions and outputs.

Use `currentState.name` for display and logs. For control flow, prefer identity checks such as `machine.currentState.is(machine.states.TimeoutDemo)`.

## Using your own logger

If the default console monitor format is close but not quite right, format the event yourself and send it somewhere else.

```ts
import {
  createRuntimeConsoleMonitor,
  formatRuntimeDebugEvent,
} from "@tdreyno/fizz"

const monitor = event => {
  const entry = formatRuntimeDebugEvent(event, {
    prefix: "[Orders]",
  })

  myLogger.write(entry.level, entry.args)
}
```

Use `createRuntimeConsoleMonitor(...)` when you want the standard readable output. Use `formatRuntimeDebugEvent(...)` when you need to integrate that output into another logging system.

## What the monitor sees

The structured monitor currently includes these event families:

- action queueing
- command start and completion
- context changes
- outputs
- runtime errors
- async start, resolve, reject, and cancellation
- timer start, completion, and cancellation
- interval start, trigger, and cancellation
- frame start, trigger, and cancellation

That makes it the right tool when a bug lives in runtime timing or lifecycle behavior rather than in one obvious transition.

## Related Docs

- [Chrome Debugger](./chrome-debugger.md)
- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [React Integration](./react-integration.md)
- [Testing](./testing.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [API](./api.md)
