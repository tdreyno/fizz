import { describe, expect, jest, test } from "@jest/globals"

import {
  createControlledAsyncDriver,
  createDefaultAsyncDriver,
} from "../runtime/asyncDriver.js"

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

describe("async drivers", () => {
  test("does not invoke default driver callbacks after cancellation", async () => {
    const driver = createDefaultAsyncDriver()
    const operation = deferred<string>()
    const onReject = jest.fn()
    const onResolve = jest.fn()
    const handle = driver.start({
      onReject,
      onResolve,
      run: () => operation.promise,
    })

    driver.cancel(handle)
    operation.resolve("Ada")
    await Promise.resolve()
    await Promise.resolve()

    expect(onResolve).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  test("invokes reject callback when default async work fails", async () => {
    const driver = createDefaultAsyncDriver()
    const onReject = jest.fn()
    const onResolve = jest.fn()

    driver.start({
      onReject,
      onResolve,
      run: async () => {
        throw new Error("boom")
      },
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(onResolve).not.toHaveBeenCalled()
    expect(onReject).toHaveBeenCalledWith(expect.any(Error))
  })

  test("cancels controlled operations and ignores missing handles", async () => {
    const driver = createControlledAsyncDriver()
    const operation = deferred<string>()
    const onReject = jest.fn()
    const onResolve = jest.fn()
    const handle = driver.start({
      onReject,
      onResolve,
      run: () => operation.promise,
    })

    driver.cancel(999)
    driver.cancel(handle)
    operation.resolve("Ada")
    await driver.flush()

    expect(onResolve).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  test("runs all pending controlled resolve and reject callbacks", async () => {
    const driver = createControlledAsyncDriver()
    const resolveOperation = deferred<string>()
    const rejectOperation = deferred<string>()
    const onReject = jest.fn()
    const onResolve = jest.fn()

    driver.start({
      onReject,
      onResolve,
      run: () => resolveOperation.promise,
    })
    driver.start({
      onReject,
      onResolve,
      run: () => rejectOperation.promise,
    })

    resolveOperation.resolve("Ada")
    rejectOperation.reject(new Error("boom"))

    await driver.flush()
    await driver.runAll()

    expect(onResolve).toHaveBeenCalledWith("Ada")
    expect(onReject).toHaveBeenCalledWith(expect.any(Error))
  })
})
