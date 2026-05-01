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
})
