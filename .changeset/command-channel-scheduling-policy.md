---
"@tdreyno/fizz": minor
---

### Breaking: `commandChannel` — channel-level scheduling policy replaces per-call `latestOnlyKey`

The per-call `latestOnlyKey` option on `commandChannel(...).command(type, payload, options?)` has been removed. Scheduling behaviour is now declared once when the channel is created.

#### Migration

**Before**

```ts
const editor = commandChannel<Commands, "notesEditor">("notesEditor")

editor.command("setDocument", { document }, { latestOnlyKey: "editor-setDocument" })
```

**After**

```ts
const editor = commandChannel<Commands, "notesEditor">("notesEditor", {
  scheduling: { mode: "replace-pending", keyPrefix: "editor" },
})

editor.command("setDocument", { document })
// coalescing key is derived automatically as "editor-setDocument"
```

#### Three scheduling modes

| Mode | Behaviour |
|------|-----------|
| `"fifo"` (default) | Commands run in arrival order; nothing is dropped |
| `"replace-pending"` | A queued (not yet running) command is replaced by a newer one with the same coalescing key |
| `"replace-pending-and-cancel-running"` | Same as above, plus the currently executing handler has its `AbortSignal` aborted |

Per-command key overrides are supported via `commands.<type>.key`.

#### Breaking: handler signature now receives `{ signal: AbortSignal }` as second argument

All command handlers now receive a second argument containing an `AbortSignal`:

**Before**

```ts
const commandHandlers = {
  drag: {
    async updatePreview(payload) { /* ... */ },
  },
}
```

**After**

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

The signal is only aborted when using `"replace-pending-and-cancel-running"` mode. For `"fifo"` and `"replace-pending"` the signal is never aborted; existing handlers that ignore the second argument continue to work without changes (TypeScript will surface the new parameter in typed handler maps, requiring the signature to be updated).

#### Payload-less commands

Commands whose schema declares `payload: void | undefined` may now be called without a payload argument:

```ts
const uiCommands = commandChannel<Commands, "toolbar">("toolbar")
uiCommands.command("focusToggle") // no payload argument required
```
