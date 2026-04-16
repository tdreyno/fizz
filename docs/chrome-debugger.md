# Chrome Debugger

The Chrome debugger solves a different problem from console logging.

Use it when you want to inspect a running browser machine as a timeline of actions, state changes, outputs, and scheduled work instead of manually stitching together `console.log(...)` calls from several layers.

The debugger setup now has two modes:

- zero-config browser mode, where the Chrome extension injects a runtime hook automatically
- manual mode, where app code installs `@tdreyno/fizz-chrome-debugger` and controls registration explicitly

This guide shows the current end-to-end setup and the tradeoffs of the first implementation slice.

## What the debugger shows

When you wire it in, the DevTools panel can receive:

- runtime registration and disconnect events
- current state name and serialized state data
- state history snapshots
- emitted output actions
- runtime monitor events such as queued actions, completed commands, and runtime errors
- scheduled work inferred from runtime monitor events for timers, intervals, async work, and frames
- replay markers when you ask the debugger to re-run captured actions

The panel is intentionally generic. It does not assume one machine shape or one framework.

## 1. Zero-config mode with the extension

If your browser runtime is created through `createRuntime(...)` or through integrations that use it internally, the Chrome extension can now install the debugger hook automatically.

That means the common browser path is:

1. build and load the unpacked extension
2. open the app in Chrome
3. open DevTools
4. use the `Fizz` panel

No app-side `createFizzChromeDebugger()` call is required for that path.

The zero-config path works because the extension injects a page-level hook before app code runs, and the core runtime auto-registers with that hook when a runtime is created.

## 2. Load the Chrome extension

The DevTools extension currently lives in this repository as a private workspace package.

Build it from the repo root:

```bash
npm run build --workspace @repo/fizz-chrome-debugger
```

Then load the unpacked extension in Chrome:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Choose Load unpacked
4. Select `packages/fizz-chrome-debugger/dist`

After you open DevTools on the page that created a runtime, you should see a `Fizz` panel with no app-side debugger wiring.

## 3. Optional manual mode

Install the runtime debugger package only when you want explicit programmatic control over debugger setup, custom transports, or non-extension integrations.

Add the debugger package to the app that owns the Fizz runtime.

```bash
npm install --save @tdreyno/fizz-chrome-debugger
```

## 4. Create the debugger alongside the runtime

Create one debugger instance in the same browser context as the runtime and use it both to create the runtime monitor and to register the runtime.

```ts
import {
  action,
  createMachine,
  createRuntime,
  enter,
  state,
} from "@tdreyno/fizz"
import { createFizzChromeDebugger } from "@tdreyno/fizz-chrome-debugger"

const arm = action("Arm")
const cancel = action("Cancel")

type TimeoutData = {
  status: "armed" | "idle"
}

const TimeoutDemo = state(
  {
    Enter: (data, _, { update }) => update(data),
    Arm: (data, _, { startTimer, update }) => [
      update({
        ...data,
        status: "armed",
      }),
      startTimer("toast", 1200),
    ],
    Cancel: (data, _, { cancelTimer, update }) => [
      update({
        ...data,
        status: "idle",
      }),
      cancelTimer("toast"),
    ],
    TimerCompleted: (data, _, { update }) =>
      update({
        ...data,
        status: "idle",
      }),
  },
  { name: "TimeoutDemo" },
)

const TimeoutMachine = createMachine(
  {
    actions: { arm, cancel },
    states: { TimeoutDemo },
  },
  "TimeoutMachine",
)

const chromeDebugger = createFizzChromeDebugger()
const runtimeId = chromeDebugger.nextRuntimeId("Timeout Demo")

const runtime = createRuntime(
  TimeoutMachine,
  TimeoutDemo({
    status: "idle",
  }),
  {
    monitor: chromeDebugger.createMonitor(runtimeId),
  },
)

const disconnectDebugger = chromeDebugger.registerRuntime({
  label: "Timeout Demo",
  runtime,
  runtimeId,
})

await runtime.run(enter())

window.addEventListener("beforeunload", () => {
  disconnectDebugger()
})
```

The important part is the pairing:

- `createMonitor(runtimeId)` gives the runtime structured lifecycle events
- `registerRuntime(...)` publishes snapshots to the browser event bridge that the extension reads

If you skip the monitor, the panel can still receive current-state and output updates, but the timeline and scheduled-work view will be less complete.

## 5. What to expect in the panel today

The current panel is intentionally simple. It shows:

- connection status for the inspected tab
- each registered runtime by label and runtime id
- the current serialized state data
- active scheduled work if the runtime monitor is attached
- a recent event list from the runtime timeline

This first slice is aimed at verifying the transport and runtime integration path before the UI grows into a richer tree and replay experience.

## 6. Replay captured actions

The debugger object can replay actions through a registered runtime.

```ts
await chromeDebugger.replay(runtimeId, [arm(), cancel(), arm()])
```

Replay currently means deterministic re-dispatch through the live runtime instance. It does not yet restore an arbitrary historical runtime snapshot.

## React integration note

If you use `useMachine(...)`, the hook already creates a core runtime through `createRuntime(...)`, so the zero-config extension path can auto-register those runtimes too.

That means React apps no longer need a manual `createFizzChromeDebugger()` call just to appear in the DevTools panel.

Manual registration is still useful when you want app-controlled debugger instances, custom transports, or explicit replay orchestration inside the app.

For React apps using the zero-config extension path:

- expect runtimes created through the hook integration to appear automatically in the panel
- expect scheduler and queue-detail visibility because the injected hook adds a runtime monitor after construction
- fall back to manual registration only when you need custom debugger behavior inside the app

## Serialization rules

The debugger serializes state data before it leaves the page runtime. The current serializer keeps the panel safe and predictable by converting unsupported values into readable placeholders.

- functions become labeled strings such as `[Function sample]`
- circular references become `[Circular]`
- `undefined` becomes `[Undefined]`
- `Error` instances become plain objects with `name`, `message`, and `stack`

That means the debugger is designed for inspection, not for lossless persistence of arbitrary runtime data.

## Troubleshooting

If the panel stays empty:

1. Confirm the extension was loaded from `packages/fizz-chrome-debugger/dist`
2. Confirm the runtime was created in the same browser page you opened in DevTools
3. Confirm the app actually creates a Fizz runtime through `createRuntime(...)` or an integration that uses it
4. If you are not using the extension auto mode, confirm the app created a Chrome debugger instance and called `registerRuntime(...)`

If scheduled work never appears:

1. Confirm the runtime was created with `monitor: chromeDebugger.createMonitor(runtimeId)`
2. Confirm the machine actually uses timers, intervals, frames, or async helpers

## Related Docs

- [Debugging](./debugging.md)
- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [React Integration](./react-integration.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [API](./api.md)
