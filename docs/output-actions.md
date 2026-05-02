# Output Actions

This page covers Fizz output APIs for adapter-facing communication, including machine output maps, runtime subscriptions, and command-channel ergonomics.

Use this when your machine needs to emit integration-facing events (editor adapters, bridge layers, host UI synchronization) without introducing hidden side effects.

## Output Model

Outputs are explicit actions emitted from state handlers and observed outside the machine.

- machine handlers emit outputs
- runtimes expose output subscribers
- adapters decide what to do with emitted outputs

Outputs are not a replacement for transitions or internal actions. Keep business-state changes in machine transitions, and use outputs for integration boundaries.

## Machine Output Maps

`createMachine(...)` supports both:

- `outputActions`
- `outputs` (alias)

Example:

```ts
const EditorMachine = createMachine({
  actions: { saveDraft },
  outputs: { draftSaved },
  states: { Editing, Idle },
})
```

Do not define both `outputs` and `outputActions` in the same machine definition.

## Emitting Outputs

### `output(action)`

Emit a regular output action.

```ts
const saved = action("Saved")

const Saving = state<Enter>({
  Enter: () => output(saved()),
})
```

### `outputCommand(channel, type, payload)`

Emit adapter-oriented command outputs directly from a handler.

```ts
const Editing = state<{ document: string }>({
  Enter: data =>
    outputCommand("notesEditor", "setDocument", {
      document: data.document,
    }),
})
```

`outputCommand(...)` is direct-use in handlers. Do not wrap it in `output(...)`.

### `commandChannel(channel, options?)`

`commandChannel(...)` is already available in the core API. It binds one channel once and returns helpers for channel-scoped commands and batches.

Use it when a state repeatedly targets one channel and you want to avoid repeating channel literals. Provide a scheduling policy to control how commands coalesce or cancel when many arrive rapidly.

```ts
// No policy: FIFO, commands run in arrival order
const sessionCommands = commandChannel<Commands, "session">("session")

// Replace pending: new command supersedes a queued-but-not-yet-running one
const editorCommands = commandChannel<Commands, "notesEditor">("notesEditor", {
  scheduling: { mode: "replace-pending", keyPrefix: "editor" },
})

// Replace pending AND abort running: ideal for animation-frame-style work
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

```ts
const Editing = state({
  ApplyRemote: (_data, payload) =>
    editorCommands
      .batch([
        editorCommands.command("setDocument", {
          document: payload.document,
        }),
        editorCommands.command("setEditable", {
          editable: payload.editable,
        }),
      ])
      .chainToOutput(applySucceeded(), () => applyFailed()),
})
```

`commandChannel(...)` methods:

- `command(type, payload?)`: creates a `commandEffect(...)` for the bound channel. Payload may be omitted when the schema declares it as `void` or `undefined`.
- `batch(commands, options?)`: creates an `effectBatch(...)` with the bound channel

### Scheduling policies

| Mode                                   | Key behaviour                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `"fifo"` (default)                     | Commands run in arrival order; nothing is dropped                                          |
| `"replace-pending"`                    | A queued (not yet running) command is replaced by a newer one with the same coalescing key |
| `"replace-pending-and-cancel-running"` | Same as above, plus the currently executing handler has its `AbortSignal` aborted          |

Coalescing key derivation: by default `<keyPrefix>-<commandType>`. Override individual commands with `commands.<type>.key`.

### Command handlers and AbortSignal

Every command handler receives a second argument `{ signal: AbortSignal }`:

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

Check `signal.aborted` at yield points to short-circuit cancelled work. For `fifo` and `replace-pending` channels the signal is never aborted.

### `effectBatch(...).chainToOutput(...)`

When adapter commands must run in strict order and still emit integration-facing output signals, chain a batch to outputs.

```ts
const applySucceeded = action("ApplySucceeded")
const applyFailed = action("ApplyFailed").withPayload<{ message: string }>()
const editor = commandChannel<Commands, "notesEditor">("notesEditor")

const Editing = state({
  ApplyRemote: (_data, payload) =>
    editor
      .batch([
        editor.command("setDocument", {
          document: payload.document,
        }),
        editor.command("setEditable", {
          editable: payload.editable,
        }),
      ])
      .chainToOutput(applySucceeded(), reason =>
        applyFailed({
          message: reason instanceof Error ? reason.message : "Unknown error",
        }),
      ),
})
```

Use `chainToAction(...)` instead when completion/failure should drive internal machine transitions.

## Defining Command Maps

### `defineOutputMap(...)`

Use a nested command map when you want channel/type/payload inference in one place.

```ts
const outputs = defineOutputMap({
  notesEditor: {
    setDocument: (payload: { document: string; readonly: boolean }) => payload,
    setEditable: (payload: { editable: boolean }) => payload,
  },
})
```

Map-aware `outputCommand(...)` usage:

```ts
const Editing = state<{ document: string }>({
  Enter: data =>
    outputCommand(outputs, "notesEditor", "setDocument", {
      document: data.document,
      readonly: false,
    }),
})
```

## Runtime Subscriptions

`Runtime` exposes three main output subscription styles:

- `onOutput(handler)`: observe all outputs
- `onOutputType(type, handler)`: observe one output type with payload inference
- `respondToOutput(type, handler)`: observe one output type and optionally dispatch an internal action

All subscription methods return an unsubscribe function.

### `onOutput(...)`

```ts
const stop = runtime.onOutput(output => {
  logger.debug(output.type)
})
```

### `onOutputType(...)`

```ts
const stop = runtime.onOutputType("Notice", payload => {
  console.log(payload)
})
```

### `respondToOutput(...)`

```ts
const stop = runtime.respondToOutput("RequestSave", payload => {
  return saveDraft({ id: payload.id })
})
```

## Channel Connector

### `connectOutputChannel(channelHandlers)`

Bind a nested handler object for command-style outputs.

```ts
const stop = runtime.connectOutputChannel({
  notesEditor: {
    setDocument: payload => editor.setDocument(payload.document),
    setEditable: payload => editor.setEditable(payload.editable),
  },
})
```

Routing model:

- command outputs are interpreted as `channel.type`
- unknown channel/type handlers are ignored
- matching handlers receive payload only

## Fluent API Alias

Fluent machine builders support:

- `.withOutputActions(...)`
- `.withOutputs(...)` (alias)

Example:

```ts
const editorMachine = machine("EditorMachine")
  .withStates({ Editing })
  .withOutputs({ setDocument })
```

## Related Docs

- [API](./api.md)
- [Testing](./testing.md)
- [Fluent API](./fluent-api.md)
- [Data Clients](./data-clients.md)
