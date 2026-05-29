import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action.js"
import { createInitialContext } from "../context.js"
import {
  effect,
  error,
  goBack,
  isEffect,
  log,
  matchOn,
  noop,
  outputCommand,
  startAsync,
  warn,
} from "../effect.js"

describe("effect", () => {
  test("matchOn routes discriminated union variants with narrowed case handlers", () => {
    type LoadResult =
      | { kind: "saved"; revision: number }
      | { kind: "skipped" }
      | { kind: "invalid"; reason: string }

    const resolve = matchOn<LoadResult, LoadResult["kind"], string>(
      value => value.kind,
      {
        invalid: value => `invalid:${value.reason}`,
        saved: value => `saved:${String(value.revision)}`,
        skipped: () => "skipped",
      },
    )

    expect(resolve({ kind: "saved", revision: 3 })).toBe("saved:3")
    expect(resolve({ kind: "skipped" })).toBe("skipped")
    expect(resolve({ kind: "invalid", reason: "schema" })).toBe(
      "invalid:schema",
    )
  })

  test("matchOn supports explicit no-dispatch cases with undefined", () => {
    type SaveResult = { kind: "saved"; revision: number } | { kind: "skipped" }

    const resolve = matchOn<SaveResult, SaveResult["kind"], string | undefined>(
      value => value.kind,
      {
        saved: value => `saved:${String(value.revision)}`,
        skipped: () => undefined,
      },
    )

    expect(resolve({ kind: "saved", revision: 1 })).toBe("saved:1")
    expect(resolve({ kind: "skipped" })).toBeUndefined()
  })

  test("matchOn can be passed directly to startAsync().chainToAction", () => {
    const saved = action("Saved").withPayload<number>()
    const skipped = action("Skipped")
    const failed = action("Failed").withPayload<string>()

    type SaveResult = { kind: "saved"; revision: number } | { kind: "skipped" }

    const asyncEffect = startAsync(
      Promise.resolve<SaveResult>({ kind: "skipped" }),
    ).chainToAction(
      matchOn<
        SaveResult,
        SaveResult["kind"],
        ReturnType<typeof saved> | ReturnType<typeof skipped>
      >(result => result.kind, {
        saved: result => saved(result.revision),
        skipped: () => skipped(),
      }),
      () => failed("request failed"),
    )

    expect(
      asyncEffect.data?.handlers.resolve({ kind: "saved", revision: 4 }),
    ).toEqual(saved(4))
    expect(asyncEffect.data?.handlers.resolve({ kind: "skipped" })).toEqual(
      skipped(),
    )
  })

  test("startAsync().match maps ok, err, and cancelled handlers", () => {
    const resolved = action("Resolved").withPayload<number>()
    const rejected = action("Rejected").withPayload<string>()
    const cancelled = action("Cancelled")

    const asyncEffect = startAsync<number, string, Error>(
      Promise.resolve(1),
      "profile",
    ).match({
      cancelled: () => cancelled(),
      err: reason => rejected(reason.message),
      ok: value => resolved(value),
    })

    expect(asyncEffect.data?.handlers.resolve(4)).toEqual(resolved(4))
    expect(asyncEffect.data?.handlers.reject?.(new Error("boom"))).toEqual(
      rejected("boom"),
    )
    expect(asyncEffect.data?.handlers.cancelled?.()).toEqual(cancelled())
  })

  test("creates typed output commands for map and string overloads", () => {
    const commandFromStrings = outputCommand("toast", "show", {
      message: "done",
    })
    const commandFromMap = outputCommand(
      {
        toast: {
          hide: (payload: { id: string }) => payload,
        },
      },
      "toast",
      "hide",
      { id: "42" },
    )

    expect(commandFromStrings.label).toBe("output")
    expect(commandFromMap.label).toBe("output")
    expect(commandFromStrings.data?.payload).toEqual({ message: "done" })
    expect(commandFromStrings.data?.type).toBe("toast.show")
    expect(commandFromMap.data?.type).toBe("toast.hide")
    expect(commandFromMap.data?.payload).toEqual({ id: "42" })
  })

  test("isEffect identifies effect instances", () => {
    expect(isEffect(effect("custom"))).toBe(true)
    expect(isEffect(action("World")())).toBe(false)
  })

  test("goBack and noop create effects with expected labels", () => {
    expect(goBack().label).toBe("goBack")
    expect(noop().label).toBe("noop")
  })

  test("log/error/warn delegate to custom logger when provided", () => {
    const customLogger = jest.fn()
    const context = createInitialContext(
      [
        {
          data: undefined,
          executor: () => [],
          is: () => false,
          isNamed: () => true,
          isStateTransition: true,
          mode: "append",
          name: "Idle",
          state: undefined as never,
        },
      ],
      {
        customLogger,
        enableLogging: false,
      },
    )

    log("hello", 1).executor(context)
    error("bad").executor(context)
    warn("careful").executor(context)

    expect(customLogger).toHaveBeenNthCalledWith(1, ["hello", 1], "log")
    expect(customLogger).toHaveBeenNthCalledWith(2, ["bad"], "error")
    expect(customLogger).toHaveBeenNthCalledWith(3, ["careful"], "warn")
  })

  test("log/error/warn use console when enabled and no custom logger exists", () => {
    const context = createInitialContext(
      [
        {
          data: undefined,
          executor: () => [],
          is: () => false,
          isNamed: () => true,
          isStateTransition: true,
          mode: "append",
          name: "Idle",
          state: undefined as never,
        },
      ],
      {
        enableLogging: true,
      },
    )

    const logSpy = jest.spyOn(console, "log").mockImplementation(() => void 0)
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => void 0)
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => void 0)

    log("hello").executor(context)
    error("bad").executor(context)
    warn("careful").executor(context)

    expect(logSpy).toHaveBeenCalledWith("hello")
    expect(errorSpy).toHaveBeenCalledWith("bad")
    expect(warnSpy).toHaveBeenCalledWith("careful")

    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
  })
})
