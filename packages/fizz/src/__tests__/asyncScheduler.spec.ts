import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action.js"
import { createControlledAsyncDriver } from "../runtime/asyncDriver.js"
import {
  cancelActiveAsyncOperation,
  clearAsyncOperations,
  createAsyncState,
  isAbortError,
  runAsyncOperation,
  startAsyncOperation,
} from "../runtime/asyncScheduler.js"

const runOperation = <Resolved>(
  operation:
    | Promise<Resolved>
    | ((signal: AbortSignal, context: never) => Promise<Resolved>),
  signal: AbortSignal,
): Promise<Resolved> => runAsyncOperation({} as never, operation, signal)

describe("asyncScheduler", () => {
  test("startAsyncOperation resolves and dispatches resolved action", async () => {
    const Resolved = action("Resolved").withPayload<string>()
    const run = jest.fn(async () => undefined)
    const asyncDriver = createControlledAsyncDriver()
    const state = createAsyncState()

    startAsyncOperation({
      asyncDriver,
      asyncId: "load",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: value => Resolved(value),
        },
        run: async () => "ok",
      },
      isAbortError,
      nextToken: () => 1,
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    await asyncDriver.flush()
    await asyncDriver.flush()

    expect(run).toHaveBeenCalledWith(Resolved("ok"))
    expect(state.asyncOperations.has("load")).toBe(false)
  })

  test("starting same async id cancels prior operation", async () => {
    const run = jest.fn(async () => undefined)
    const asyncDriver = createControlledAsyncDriver()
    const state = createAsyncState()
    let token = 0

    startAsyncOperation({
      asyncDriver,
      asyncId: "load",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => "first",
      },
      isAbortError,
      nextToken: () => {
        token += 1

        return token
      },
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    const previousController = state.asyncOperations.get("load")?.controller

    startAsyncOperation({
      asyncDriver,
      asyncId: "load",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => "second",
      },
      isAbortError,
      nextToken: () => {
        token += 1

        return token
      },
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    await asyncDriver.flush()
    await asyncDriver.flush()

    expect(previousController?.signal.aborted).toBe(true)
    expect(state.asyncOperations.has("load")).toBe(false)
  })

  test("stale completion is ignored after replacement", async () => {
    const Resolved = action("Resolved").withPayload<string>()
    const run = jest.fn(async () => undefined)
    const asyncDriver = createControlledAsyncDriver()
    const state = createAsyncState()
    let token = 0
    let releaseFirst: (() => void) | undefined

    const longRunning = () =>
      new Promise<string>(resolve => {
        releaseFirst = () => resolve("first")
      })

    startAsyncOperation({
      asyncDriver,
      asyncId: "load",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: value => Resolved(value),
        },
        run: longRunning,
      },
      isAbortError,
      nextToken: () => {
        token += 1

        return token
      },
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    startAsyncOperation({
      asyncDriver,
      asyncId: "load",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: value => Resolved(value),
        },
        run: async () => "second",
      },
      isAbortError,
      nextToken: () => {
        token += 1

        return token
      },
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    releaseFirst?.()
    await asyncDriver.flush()
    await asyncDriver.flush()

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith(Resolved("second"))
  })

  test("reject path suppresses abort errors and dispatches non-abort errors", async () => {
    const Rejected = action("Rejected").withPayload<string>()
    const onReject = jest.fn()
    const run = jest.fn(async () => undefined)
    const asyncDriver = createControlledAsyncDriver()
    const state = createAsyncState()

    startAsyncOperation({
      asyncDriver,
      asyncId: "abort",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => Rejected("abort"),
          resolve: () => undefined,
        },
        run: async () => {
          const error = new Error("aborted")
          error.name = "AbortError"
          throw error
        },
      },
      isAbortError,
      nextToken: () => 1,
      onReject,
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    await asyncDriver.flush()
    await asyncDriver.flush()
    expect(onReject).toHaveBeenCalledWith(
      "abort",
      expect.objectContaining({ name: "AbortError" }),
    )
    expect(run).not.toHaveBeenCalled()

    startAsyncOperation({
      asyncDriver,
      asyncId: "fail",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => Rejected("failed"),
          resolve: () => undefined,
        },
        run: async () => {
          throw new Error("boom")
        },
      },
      isAbortError,
      nextToken: () => 2,
      onReject,
      parallel: state.parallel,
      run,
      runAsyncOperation: runOperation,
    })

    await asyncDriver.flush()
    await asyncDriver.flush()
    expect(run).toHaveBeenCalledWith(Rejected("failed"))
  })

  test("cancelActiveAsyncOperation handles missing and active operation", () => {
    const asyncDriver = createControlledAsyncDriver()
    const state = createAsyncState()

    expect(
      cancelActiveAsyncOperation({
        asyncDriver,
        asyncId: "missing",
        asyncOperations: state.asyncOperations,
        parallel: state.parallel,
      }),
    ).toBe(false)

    startAsyncOperation({
      asyncDriver,
      asyncId: "load",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => "ok",
      },
      isAbortError,
      nextToken: () => 1,
      parallel: state.parallel,
      run: async () => undefined,
      runAsyncOperation: runOperation,
    })

    expect(
      cancelActiveAsyncOperation({
        asyncDriver,
        asyncId: "load",
        asyncOperations: state.asyncOperations,
        parallel: state.parallel,
      }),
    ).toBe(true)
    expect(state.asyncOperations.has("load")).toBe(false)
  })

  test("clearAsyncOperations cancels all active operations", () => {
    const asyncDriver = createControlledAsyncDriver()
    const state = createAsyncState()

    startAsyncOperation({
      asyncDriver,
      asyncId: "a",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => "a",
      },
      isAbortError,
      nextToken: () => 1,
      parallel: state.parallel,
      run: async () => undefined,
      runAsyncOperation: runOperation,
    })

    startAsyncOperation({
      asyncDriver,
      asyncId: "b",
      asyncOperations: state.asyncOperations,
      createController: () => new AbortController(),
      data: {
        handlers: {
          reject: () => undefined,
          resolve: () => undefined,
        },
        run: async () => "b",
      },
      isAbortError,
      nextToken: () => 2,
      parallel: state.parallel,
      run: async () => undefined,
      runAsyncOperation: runOperation,
    })

    clearAsyncOperations({
      asyncDriver,
      asyncOperations: state.asyncOperations,
      parallel: state.parallel,
    })

    expect(state.asyncOperations.size).toBe(0)
  })

  test("isAbortError handles signal and AbortError names", () => {
    const controller = new AbortController()

    expect(isAbortError(new Error("x"), controller.signal)).toBe(false)
    expect(
      isAbortError({ name: "AbortError" }, new AbortController().signal),
    ).toBe(true)

    controller.abort()
    expect(isAbortError(new Error("x"), controller.signal)).toBe(true)
  })

  test("runAsyncOperation supports function, promise, and non-error rejection", async () => {
    await expect(
      runAsyncOperation(
        {} as never,
        async () => "ok-function",
        new AbortController().signal,
      ),
    ).resolves.toBe("ok-function")

    await expect(
      runAsyncOperation(
        {} as never,
        Promise.resolve("ok-promise"),
        new AbortController().signal,
      ),
    ).resolves.toBe("ok-promise")

    await expect(
      runAsyncOperation(
        {} as never,
        Promise.reject(new Error("boom")),
        new AbortController().signal,
      ),
    ).rejects.toThrow("boom")
  })
})
