# Output Actions

Use this reference when a task involves machine-to-adapter communication through Fizz outputs.

## What Outputs Are For

Use outputs for integration boundaries:

- editor adapters
- host application bridges
- non-machine side coordination that should stay explicit

Do not use outputs as a replacement for internal state transitions.

## Machine-Level Output Maps

`createMachine(...)` accepts:

- `outputActions`
- `outputs` (alias)

Do not define both in one machine definition.

When modeling command channels, prefer `defineOutputMap(...)` to keep channel/type/payload inference centralized.

## Emission APIs

### `output(action)`

Use for standard emitted actions.

### `outputCommand(channel, type, payload)`

Use for adapter command channels. This is direct-use in state handlers.

Do not wrap with `output(...)`.

Map-aware overload:

- `outputCommand(outputsMap, channel, type, payload)`

This variant infers payload shape from the map entry.

### `commandChannel(channel, options?)`

Use `commandChannel(...)` when one state repeatedly targets the same channel and should not repeat channel literals in every command and batch call. Pass an optional scheduling policy to control coalescing and cancellation.

- `command(type, payload?)` creates a channel-scoped `commandEffect(...)`. Payload may be omitted when the schema declares it as `void` or `undefined`.
- `batch(commands, options?)` creates a channel-scoped `effectBatch(...)`

#### Scheduling policies

| Mode                                   | Behaviour                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `"fifo"` (default)                     | Commands run in arrival order; nothing is dropped                                          |
| `"replace-pending"`                    | A queued (not yet running) command is replaced by a newer one with the same coalescing key |
| `"replace-pending-and-cancel-running"` | Same as above, plus the currently executing handler has its `AbortSignal` aborted          |

Key derivation: `<keyPrefix>-<commandType>` by default. Override per-command with `commands.<type>.key`.

```ts
// FIFO (no options)
const sessionCommands = commandChannel<Commands, "session">("session")

// Replace pending — collapses queued commands with same key
const editorCommands = commandChannel<Commands, "notesEditor">("notesEditor", {
  scheduling: { mode: "replace-pending", keyPrefix: "editor" },
})

// Replace pending AND abort running — ideal for animation-frame work
const dragCommands = commandChannel<Commands, "drag">("drag", {
  scheduling: {
    mode: "replace-pending-and-cancel-running",
    keyPrefix: "drag",
    commands: {
      updatePreview: { key: "drag-frame" },
      restoreGeometry: { key: "drag-frame" },
    },
  },
})
```

#### AbortSignal in handlers

Every command handler receives `{ signal: AbortSignal }` as its second argument:

```ts
const commandHandlers = {
  drag: {
    async updatePreview(payload, { signal }) {
      await waitForFrame(signal)
      if (signal.aborted) return
      applyDragPreview(payload)
    },
  },
}
```

The signal is aborted only when a `replace-pending-and-cancel-running` channel supersedes the running task. For `fifo` and `replace-pending` channels the signal is never aborted.

This helper is ergonomic sugar over `commandEffect(...)` and `effectBatch(...)`; the scheduling policy is the primary behavioral addition.

### `effectBatch(...).chainToOutput(...)`

Use this when multiple imperative commands must run in order and then emit one success/failure output signal.

- Batch entries should be `commandEffect(...)` calls.
- Prefer `commandChannel(...)` to avoid repeating channel literals and batch channel options.
- `channel` is optional; when set, same-channel batches are serialized.
- `onError` defaults to `"failBatch"`.
- Prefer `chainToAction(...)` instead when completion/failure should change machine state directly.

## Runtime Subscription APIs

Use based on intent:

- `onOutput(...)`: observe all outputs
- `onOutputType(type, handler)`: observe one output type
- `respondToOutput(type, handler)`: observe and optionally dispatch follow-up internal actions
- `connectOutputChannel(channelHandlers)`: bind nested channel/type payload handlers for command-style outputs

All return unsubscribe callbacks.

## Channel Connector Guidance

`connectOutputChannel(...)` expects command-style output types in `channel.type` format.

Routing behavior:

- unknown channel/type handlers are ignored
- matching handlers receive payload only

Use this as adapter wiring convenience, not as a replacement for machine transitions.

## Fluent API Parity

Fluent machine builders support:

- `.withOutputActions(...)`
- `.withOutputs(...)` (alias)

Keep one style per machine definition for readability.

## Related Docs

- `docs/output-actions.md`
- `docs/testing.md`
- `docs/fluent-api.md`
