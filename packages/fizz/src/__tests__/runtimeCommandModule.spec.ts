import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action"
import { createRuntimeCommandModule } from "../runtime/runtimeCommandModule"

type RuntimeStateStub = {
  data: unknown
  executor: () => Array<unknown>
  isNamed: () => boolean
  isStateTransition: true
  mode: "append" | "update"
  name: string
  state: never
}

const createState = (
  name: string,
  mode: "append" | "update" = "append",
): RuntimeStateStub => ({
  data: {},
  executor: () => [],
  isNamed: () => true,
  isStateTransition: true,
  mode,
  name,
  state: (() => {
    throw new Error("state should not run")
  }) as never,
})

const flushTasks = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

const waitFor = async (predicate: () => boolean, maxAttempts = 20) => {
  for (let index = 0; index < maxAttempts; index += 1) {
    if (predicate()) {
      return
    }

    await flushTasks()
  }

  throw new Error("Condition did not pass within the expected attempts")
}

describe("runtime command module", () => {
  test("maps synchronous command handlers to runtime commands", () => {
    const resolved = action("Resolved").withPayload<string>()
    const monitorEvents: Array<string> = []
    const runAction = jest.fn(async () => undefined)
    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {
        notes: {
          load: () => "ok",
        },
      },
      emitMonitor: event => {
        monitorEvents.push(event.type)
      },
      emitOutput: () => undefined,
      missingHandlerPolicy: "noop",
      runAction,
    })

    const commandHandler = module.effectHandlers.get("commandEffect")

    expect(commandHandler).toBeDefined()

    const commands = commandHandler!({
      data: {
        channel: "notes",
        commandType: "load",
        handlers: {
          reject: () => undefined,
          resolve: (value: string) => resolved(value),
        },
        payload: { id: "1" },
      },
      label: "commandEffect",
    } as never)

    expect(commands).toEqual([
      {
        action: resolved("ok"),
        kind: "action",
      },
    ])
    expect(monitorEvents).toEqual([
      "imperative-command-started",
      "imperative-command-completed",
    ])
    expect(runAction).not.toHaveBeenCalled()
  })

  test("routes async command failures through reject handlers", async () => {
    const rejected = action("Rejected").withPayload<string>()
    const runAction = jest.fn(async () => undefined)
    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {
        notes: {
          save: async () => {
            throw new Error("nope")
          },
        },
      },
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      missingHandlerPolicy: "noop",
      runAction,
    })

    const commandHandler = module.effectHandlers.get("commandEffect")

    expect(
      commandHandler!({
        data: {
          channel: "notes",
          commandType: "save",
          handlers: {
            reject: () => rejected("failed"),
            resolve: () => undefined,
          },
          payload: { id: "1" },
        },
        label: "commandEffect",
      } as never),
    ).toEqual([])

    await flushTasks()

    expect(runAction).toHaveBeenCalledWith(rejected("failed"))
  })

  test("supports warn and error policies for missing command handlers", () => {
    const warnSpy = jest
      .spyOn(console, "warn")
      .mockImplementation(() => undefined)
    const monitorEvents: Array<string> = []
    const warnModule = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {},
      emitMonitor: event => {
        monitorEvents.push(event.type)
      },
      emitOutput: () => undefined,
      missingHandlerPolicy: "warn",
      runAction: async () => undefined,
    })
    const errorModule = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {},
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      missingHandlerPolicy: "error",
      runAction: async () => undefined,
    })

    expect(
      warnModule.effectHandlers.get("commandEffect")!({
        data: {
          channel: "notes",
          commandType: "load",
          handlers: {
            reject: () => undefined,
            resolve: () => undefined,
          },
          payload: { id: "1" },
        },
        label: "commandEffect",
      } as never),
    ).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      "Fizz missing command handler for notes.load",
    )
    expect(monitorEvents).toContain("imperative-command-missing-handler")

    expect(() =>
      errorModule.effectHandlers.get("commandEffect")!({
        data: {
          channel: "notes",
          commandType: "load",
          handlers: {
            reject: () => undefined,
            resolve: () => undefined,
          },
          payload: { id: "1" },
        },
        label: "commandEffect",
      } as never),
    ).toThrow("Fizz missing command handler for notes.load")

    warnSpy.mockRestore()
  })

  test("handles effect batches and maps reject and resolve signals", async () => {
    const failed = action("BatchFailed").withPayload<string>()
    const done = action("BatchDone")
    const outputNotice = action("OutputNotice").withPayload<string>()
    const itemResolved = action("ItemResolved").withPayload<string>()
    const outputs: Array<unknown> = []
    const runAction = jest.fn(async () => undefined)
    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {
        notes: {
          load: () => "ok",
        },
      },
      emitMonitor: () => undefined,
      emitOutput: action => {
        outputs.push(action)
      },
      missingHandlerPolicy: "noop",
      runAction,
    })

    const effectBatchHandler = module.effectHandlers.get("effectBatch")

    expect(effectBatchHandler).toBeDefined()

    expect(
      effectBatchHandler!({
        data: {
          effects: [
            {
              data: undefined,
              label: "noop",
            },
          ],
          handlers: {
            rejectAction: () => failed("invalid"),
            rejectOutput: () => outputNotice("invalid"),
            resolveAction: () => done(),
            resolveOutput: () => outputNotice("ok"),
          },
          onError: "continue",
        },
        label: "effectBatch",
      } as never),
    ).toEqual([])

    await flushTasks()
    await flushTasks()

    expect(runAction).toHaveBeenCalledWith(failed("invalid"))
    expect(outputs).toContainEqual(outputNotice("invalid"))

    runAction.mockClear()
    outputs.splice(0, outputs.length)

    expect(
      effectBatchHandler!({
        data: {
          channel: "channel-a",
          effects: [
            {
              data: {
                channel: "notes",
                commandType: "load",
                handlers: {
                  reject: () => undefined,
                  resolve: () => itemResolved("ok"),
                },
                payload: { id: "1" },
              },
              label: "commandEffect",
            },
          ],
          handlers: {
            rejectAction: () => failed("bad"),
            rejectOutput: () => outputNotice("bad"),
            resolveAction: () => done(),
            resolveOutput: () => outputNotice("good"),
          },
          onError: "failBatch",
        },
        label: "effectBatch",
      } as never),
    ).toEqual([])

    await waitFor(() => runAction.mock.calls.length >= 2)

    expect(runAction.mock.calls.flat()).toEqual(
      expect.arrayContaining([itemResolved("ok"), done()]),
    )
    expect(outputs).toContainEqual(outputNotice("good"))
  })

  test("returns no-op clear hooks", () => {
    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {},
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      missingHandlerPolicy: "noop",
      runAction: async () => undefined,
    })

    expect(module.clear()).toBeUndefined()
    expect(module.clearForGoBack()).toBeUndefined()
    expect(
      module.clearForTransition({
        currentState: createState("A") as never,
        targetState: createState("B") as never,
      }),
    ).toBeUndefined()
  })

  test("latestOnlyKey: only last queued command with same key executes", async () => {
    const monitorEvents: Array<string> = []
    const executions: Array<string> = []
    const runAction = jest.fn(async () => undefined)

    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {
        drag: {
          updatePreview: async (payload: unknown) => {
            executions.push((payload as { id: string }).id)
            return "done"
          },
        },
      },
      emitMonitor: event => {
        monitorEvents.push(event.type)
      },
      emitOutput: () => undefined,
      missingHandlerPolicy: "noop",
      runAction,
    })

    const commandHandler = module.effectHandlers.get("commandEffect")!

    // Enqueue first (will start executing immediately since queue is empty)
    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "drag-preview",
        payload: { id: "1" },
      },
      label: "commandEffect",
    } as never)

    // Enqueue second, third with same key — second should be replaced by third
    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "drag-preview",
        payload: { id: "2" },
      },
      label: "commandEffect",
    } as never)

    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "drag-preview",
        payload: { id: "3" },
      },
      label: "commandEffect",
    } as never)

    await waitFor(() => executions.length === 2)

    // id: "1" runs first (was already executing), id: "3" runs after (id: "2" was replaced)
    expect(executions).toEqual(["1", "3"])
    expect(monitorEvents).toContain("imperative-command-replaced")
  })

  test("latestOnlyKey: commands on different keys are not affected", async () => {
    const executions: Array<string> = []
    const runAction = jest.fn(async () => undefined)

    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {
        drag: {
          updatePreview: async (payload: unknown) => {
            executions.push((payload as { id: string }).id)
            return "done"
          },
        },
      },
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      missingHandlerPolicy: "noop",
      runAction,
    })

    const commandHandler = module.effectHandlers.get("commandEffect")!

    // First occupies the channel (running)
    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "key-a",
        payload: { id: "a1" },
      },
      label: "commandEffect",
    } as never)

    // Two with key-b and key-a pending
    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "key-b",
        payload: { id: "b1" },
      },
      label: "commandEffect",
    } as never)

    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "key-a",
        payload: { id: "a2" },
      },
      label: "commandEffect",
    } as never)

    await waitFor(() => executions.length === 3)

    // key-a latest replaces previous key-a; key-b is untouched
    expect(executions).toContain("a1") // already running when replacement happened
    expect(executions).toContain("a2")
    expect(executions).toContain("b1")
    expect(executions).not.toContain("a1a1") // sanity
  })

  test("latestOnlyKey: running task at index 0 is never replaced", async () => {
    let resolveFirst!: () => void
    const executions: Array<string> = []
    const runAction = jest.fn(async () => undefined)

    const module = createRuntimeCommandModule({
      actionCommand: action => ({ action, kind: "action" }),
      commandHandlers: {
        drag: {
          updatePreview: async (payload: unknown) => {
            const id = (payload as { id: string }).id

            if (id === "1") {
              await new Promise<void>(resolve => {
                resolveFirst = resolve
              })
            }

            executions.push(id)
            return "done"
          },
        },
      },
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      missingHandlerPolicy: "noop",
      runAction,
    })

    const commandHandler = module.effectHandlers.get("commandEffect")!

    // Start first — will block until resolveFirst() is called
    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "drag-preview",
        payload: { id: "1" },
      },
      label: "commandEffect",
    } as never)

    // Enqueue two pending entries — second should replace first pending
    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "drag-preview",
        payload: { id: "2" },
      },
      label: "commandEffect",
    } as never)

    commandHandler({
      data: {
        channel: "drag",
        commandType: "updatePreview",
        handlers: { reject: () => undefined, resolve: () => undefined },
        latestOnlyKey: "drag-preview",
        payload: { id: "3" },
      },
      label: "commandEffect",
    } as never)

    // Unblock the running task
    resolveFirst()

    await waitFor(() => executions.length === 2)

    // id "1" completes (was running), id "3" runs next, id "2" was replaced
    expect(executions).toEqual(["1", "3"])
  })
})
