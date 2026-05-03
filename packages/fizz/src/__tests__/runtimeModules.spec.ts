import { describe, expect, jest, test } from "@jest/globals"

import { createInitialContext } from "../context.js"
import { createControlledAsyncDriver } from "../runtime/asyncDriver.js"
import { createRuntimeModules } from "../runtime/runtimeModules.js"
import { createControlledTimerDriver } from "../runtime/timerDriver.js"
import { setStateResource } from "../stateResources.js"

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

describe("runtimeModules", () => {
  test("listener diagnostics sort same-target listeners by type", () => {
    const state = createState("Ready")
    const context = createInitialContext([state as never])

    setStateResource({
      key: "dom:listen:window:keydown:1",
      state: state as never,
      value: {},
    })
    setStateResource({
      key: "dom:listen:window:click:2",
      state: state as never,
      value: {},
    })

    const modules = createRuntimeModules({
      actionCommand: action => action.type,
      asyncDriver: createControlledAsyncDriver(),
      commandHandlers: {} as never,
      currentState: () => state as never,
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      getContext: () => context,
      handleGoBack: () => [],
      missingCommandHandlerPolicy: "warn",
      runAction: async () => undefined,
      runtime: {
        currentState: () => state as never,
      } as never,
      timerDriver: createControlledTimerDriver(),
    })

    expect(modules.getDiagnostics().listeners).toEqual([
      {
        count: 1,
        target: "window",
        type: "click",
      },
      {
        count: 1,
        target: "window",
        type: "keydown",
      },
    ])

    modules.disconnect()
  })

  test("listener diagnostics fall back to unknown type when separator parsing fails", () => {
    const state = createState("Ready")
    const context = createInitialContext([state as never])

    setStateResource({
      key: "dom:listen:window:click:1",
      state: state as never,
      value: {},
    })

    const modules = createRuntimeModules({
      actionCommand: action => action.type,
      asyncDriver: createControlledAsyncDriver(),
      commandHandlers: {} as never,
      currentState: () => state as never,
      emitMonitor: () => undefined,
      emitOutput: () => undefined,
      getContext: () => context,
      handleGoBack: () => [],
      missingCommandHandlerPolicy: "warn",
      runAction: async () => undefined,
      runtime: {
        currentState: () => state as never,
      } as never,
      timerDriver: createControlledTimerDriver(),
    })

    const lastIndexOf = jest.spyOn(String.prototype, "lastIndexOf")
    const originalLastIndexOf = Object.getOwnPropertyDescriptor(
      String.prototype,
      "lastIndexOf",
    )?.value as
      | ((searchString: string, position?: number) => number)
      | undefined

    if (originalLastIndexOf === undefined) {
      throw new Error("Expected String.prototype.lastIndexOf")
    }

    lastIndexOf.mockImplementation(function (
      this: string,
      searchString: string,
      position?: number,
    ) {
      if (this.toString() === "window:click") {
        return -1
      }

      return Reflect.apply(originalLastIndexOf, this.toString(), [
        searchString,
        position,
      ])
    })

    expect(modules.getDiagnostics().listeners).toEqual([
      {
        count: 1,
        target: "window:click",
        type: "unknown",
      },
    ])

    lastIndexOf.mockRestore()
    modules.disconnect()
  })
})
