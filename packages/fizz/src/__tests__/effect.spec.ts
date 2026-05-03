import { describe, expect, jest, test } from "@jest/globals"

import { action } from "../action.js"
import { createInitialContext } from "../context.js"
import {
  effect,
  error,
  goBack,
  isEffect,
  log,
  noop,
  outputCommand,
  warn,
} from "../effect.js"

describe("effect", () => {
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
