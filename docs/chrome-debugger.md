# Chrome Debugger

The Chrome debugger solves a different problem from console logging.

Use it when you want to inspect a running browser machine as a timeline of actions, state changes, outputs, and scheduled work instead of manually stitching together `console.log(...)` calls from several layers.

The debugger setup is zero-config in browser apps that create runtimes through `createRuntime(...)` or integrations that use it internally.

This guide shows the current end-to-end setup and the current implementation slice.

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

## 3. What to expect in the panel today

The current panel is intentionally simple. It shows:

- connection status for the inspected tab
- each registered runtime by label and runtime id
- the current serialized state data
- active scheduled work if the runtime monitor is attached
- a recent event list from the runtime timeline

This first slice is aimed at verifying the transport and runtime integration path before the UI grows into a richer tree and replay experience.

## React integration note

If you use `useMachine(...)`, the hook already creates a core runtime through `createRuntime(...)`, so the zero-config extension path can auto-register those runtimes too.

For React apps using the zero-config extension path:

- expect runtimes created through the hook integration to appear automatically in the panel
- expect scheduler and queue-detail visibility because the injected hook adds a runtime monitor after construction
- expect no additional app-side debugger setup in typical usage

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

## Related Docs

- [Debugging](./debugging.md)
- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [React Integration](./react-integration.md)
- [Async](./async.md)
- [Timers](./timers.md)
- [Intervals](./intervals.md)
- [API](./api.md)
