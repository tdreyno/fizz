import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType } from "../action"
import { action } from "../action"
import { createInitialContext } from "../context"
import { commandChannel, commandEffect, effectBatch } from "../effect"
import { Runtime } from "../runtime"
import { state } from "../state"

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

const flush = async (): Promise<void> => {
  await new Promise<void>(resolve => {
    setTimeout(() => {
      resolve()
    }, 0)
  })
}

const waitFor = async (
  predicate: () => boolean,
  attempts = 30,
): Promise<void> => {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) {
      return
    }

    await flush()
  }

  throw new Error("Timed out waiting for condition")
}

type EditorCommands = {
  notesEditor: {
    setDocument: {
      payload: { document: string }
      result: { saved: true }
    }
  }
}

describe("effectBatch", () => {
  test("should provide channel-bound command and batch helpers", () => {
    const editor = commandChannel<EditorCommands, "notesEditor">("notesEditor")

    const command = editor.command("setDocument", { document: "hello" })
    const batch = editor.batch([command], {
      onError: "continue",
    })

    expect(command.label).toBe("commandEffect")
    expect(command.data).toMatchObject({
      channel: "notesEditor",
      commandType: "setDocument",
      payload: { document: "hello" },
    })

    expect(batch.label).toBe("effectBatch")
    expect(batch.data).toMatchObject({
      channel: "notesEditor",
      onError: "continue",
    })
  })

  test("should support omitted options and default failBatch behavior", async () => {
    const applyRemote = action("ApplyRemote")
    const applySucceeded = action("ApplySucceeded")
    const applyFailed = action("ApplyFailed")

    type ApplyRemote = ActionCreatorType<typeof applyRemote>
    type ApplySucceeded = ActionCreatorType<typeof applySucceeded>
    type ApplyFailed = ActionCreatorType<typeof applyFailed>

    const Editing = state<
      ApplyRemote | ApplySucceeded | ApplyFailed,
      {
        calls: number
        status: "idle" | "failed" | "succeeded"
      }
    >(
      {
        ApplyRemote: () =>
          effectBatch([
            commandEffect<EditorCommands, "notesEditor", "setDocument">(
              "notesEditor",
              "setDocument",
              { document: "bad" },
            ),
            commandEffect<EditorCommands, "notesEditor", "setDocument">(
              "notesEditor",
              "setDocument",
              { document: "after-failure" },
            ),
          ]).chainToAction(applySucceeded(), () => applyFailed()),
        ApplyFailed: (data, _, { update }) =>
          update({
            ...data,
            status: "failed",
          }),
        ApplySucceeded: (data, _, { update }) =>
          update({
            ...data,
            status: "succeeded",
          }),
      },
      { name: "Editing" },
    )

    let callCount = 0

    const runtime = new Runtime(
      createInitialContext([Editing({ calls: 0, status: "idle" })]),
      { applyFailed, applyRemote, applySucceeded },
      {},
      {
        commandHandlers: {
          notesEditor: {
            setDocument: payload => {
              const commandPayload = payload as { document: string }

              callCount += 1

              if (commandPayload.document === "bad") {
                throw new Error("failed")
              }

              return { saved: true as const }
            },
          },
        },
      },
    )

    await runtime.run(applyRemote())
    await waitFor(
      () =>
        (runtime.currentState().data as { status: string }).status === "failed",
    )

    expect(callCount).toBe(1)
    expect(
      runtime.currentState().data as { calls: number; status: string },
    ).toEqual({
      calls: 0,
      status: "failed",
    })
  })

  test("should serialize batches on the same channel", async () => {
    const applyRemote = action("ApplyRemote").withPayload<{ id: string }>()
    const applyDone = action("ApplyDone")

    type ApplyRemote = ActionCreatorType<typeof applyRemote>
    type ApplyDone = ActionCreatorType<typeof applyDone>

    const Editing = state<ApplyRemote | ApplyDone, { done: number }>(
      {
        ApplyDone: (data, _, { update }) =>
          update({
            ...data,
            done: data.done + 1,
          }),
        ApplyRemote: (_, payload) =>
          effectBatch(
            [
              commandEffect<EditorCommands, "notesEditor", "setDocument">(
                "notesEditor",
                "setDocument",
                { document: `${payload.id}-step-1` },
              ),
              commandEffect<EditorCommands, "notesEditor", "setDocument">(
                "notesEditor",
                "setDocument",
                { document: `${payload.id}-step-2` },
              ),
            ],
            {
              channel: "editor",
            },
          ).chainToAction(applyDone()),
      },
      { name: "Editing" },
    )

    const firstGate = deferred<{ saved: true }>()
    const secondGate = deferred<{ saved: true }>()
    const callOrder: string[] = []

    const runtime = new Runtime(
      createInitialContext([Editing({ done: 0 })]),
      { applyDone, applyRemote },
      {},
      {
        commandHandlers: {
          notesEditor: {
            setDocument: payload => {
              const commandPayload = payload as { document: string }

              callOrder.push(commandPayload.document)

              if (commandPayload.document === "first-step-1") {
                return firstGate.promise
              }

              if (commandPayload.document === "second-step-1") {
                return secondGate.promise
              }

              return { saved: true as const }
            },
          },
        },
      },
    )

    const firstRun = runtime.run(applyRemote({ id: "first" }))
    const secondRun = runtime.run(applyRemote({ id: "second" }))

    await waitFor(() => callOrder.length === 1)
    expect(callOrder).toEqual(["first-step-1"])

    firstGate.resolve({ saved: true })
    await waitFor(() => callOrder.length === 3)

    expect(callOrder).toEqual(["first-step-1", "first-step-2", "second-step-1"])

    secondGate.resolve({ saved: true })

    await firstRun
    await secondRun
    await waitFor(() => callOrder.length === 4)

    expect(callOrder).toEqual([
      "first-step-1",
      "first-step-2",
      "second-step-1",
      "second-step-2",
    ])
  })

  test("should support chainToOutput on success and failure", async () => {
    const applyRemote = action("ApplyRemote").withPayload<{ fail?: boolean }>()
    const batchCompleted = action("BatchCompleted")
    const batchFailed = action("BatchFailed").withPayload<{ message: string }>()
    const editor = commandChannel<EditorCommands, "notesEditor">("notesEditor")

    type ApplyRemote = ActionCreatorType<typeof applyRemote>

    const Editing = state<ApplyRemote, undefined>(
      {
        ApplyRemote: (_, payload) =>
          editor
            .batch([
              editor.command("setDocument", {
                document: payload.fail ? "bad" : "good",
              }),
            ])
            .chainToOutput(batchCompleted(), reason =>
              batchFailed({
                message: reason instanceof Error ? reason.message : "unknown",
              }),
            ),
      },
      { name: "Editing" },
    )

    const runtime = new Runtime(
      createInitialContext([Editing()]),
      { applyRemote },
      { batchCompleted, batchFailed },
      {
        commandHandlers: {
          notesEditor: {
            setDocument: payload => {
              const commandPayload = payload as { document: string }

              if (commandPayload.document === "bad") {
                throw new Error("no editor")
              }

              return { saved: true as const }
            },
          },
        },
      },
    )

    const outputs: string[] = []

    runtime.onOutput(action => {
      outputs.push(action.type)
    })

    await runtime.run(applyRemote({}))
    await runtime.run(applyRemote({ fail: true }))
    await waitFor(() => outputs.length === 2)

    expect(outputs).toEqual(["BatchCompleted", "BatchFailed"])
  })
})

describe("commandChannel scheduling policy", () => {
  type DragCommands = {
    dragPreview: {
      updatePreview: {
        payload: { x: number; y: number }
        result: void
      }
      restoreGeometry: {
        payload: { x: number; y: number }
        result: void
      }
    }
    session: {
      update: {
        payload: { duration: number }
        result: void
      }
    }
    toolbar: {
      focusToggle: {
        payload: void
        result: void
      }
    }
  }

  test("fifo mode does not set a latestOnlyKey", () => {
    const ch = commandChannel<DragCommands, "session">("session", {
      scheduling: { mode: "fifo" },
    })

    const cmd = ch.command("update", { duration: 100 })

    expect(cmd.data).toMatchObject({
      channel: "session",
      commandType: "update",
      payload: { duration: 100 },
    })
    expect(cmd.data?.latestOnlyKey).toBeUndefined()
    expect(cmd.data?.schedulingMode).toBeUndefined()
  })

  test("replace-pending mode generates latestOnlyKey from keyPrefix and commandType", () => {
    const ch = commandChannel<DragCommands, "dragPreview">("dragPreview", {
      scheduling: { mode: "replace-pending", keyPrefix: "drag-preview" },
    })

    const cmd = ch.command("updatePreview", { x: 10, y: 20 })

    expect(cmd.data?.latestOnlyKey).toBe("drag-preview-updatePreview")
    expect(cmd.data?.schedulingMode).toBe("replace-pending")
  })

  test("replace-pending-and-cancel-running mode sets schedulingMode on effect data", () => {
    const ch = commandChannel<DragCommands, "dragPreview">("dragPreview", {
      scheduling: {
        mode: "replace-pending-and-cancel-running",
        keyPrefix: "drag-preview",
      },
    })

    const cmd = ch.command("updatePreview", { x: 10, y: 20 })

    expect(cmd.data?.latestOnlyKey).toBe("drag-preview-updatePreview")
    expect(cmd.data?.schedulingMode).toBe("replace-pending-and-cancel-running")
  })

  test("per-command key override takes precedence over generated key", () => {
    const ch = commandChannel<DragCommands, "dragPreview">("dragPreview", {
      scheduling: {
        mode: "replace-pending",
        keyPrefix: "drag-preview",
        commands: {
          updatePreview: { key: "custom-preview-key" },
          restoreGeometry: { key: "custom-preview-key" },
        },
      },
    })

    const update = ch.command("updatePreview", { x: 10, y: 20 })
    const restore = ch.command("restoreGeometry", { x: 0, y: 0 })

    expect(update.data?.latestOnlyKey).toBe("custom-preview-key")
    expect(restore.data?.latestOnlyKey).toBe("custom-preview-key")
  })

  test("commandChannel without options behaves as fifo (no latestOnlyKey)", () => {
    const ch = commandChannel<DragCommands, "session">("session")

    const cmd = ch.command("update", { duration: 100 })

    expect(cmd.data?.latestOnlyKey).toBeUndefined()
    expect(cmd.data?.schedulingMode).toBeUndefined()
  })

  test("payload-less command can be called without payload argument", () => {
    const ch = commandChannel<DragCommands, "toolbar">("toolbar")

    // TypeScript should allow omitting payload when schema declares it as void
    const cmd = ch.command("focusToggle")

    expect(cmd.label).toBe("commandEffect")
    expect(cmd.data).toMatchObject({
      channel: "toolbar",
      commandType: "focusToggle",
    })
  })
})
