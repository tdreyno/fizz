import { describe, expect, test } from "@jest/globals"

import { MissingCurrentState, UnknownStateReturnType } from "../errors"

describe("errors", () => {
  test("should construct MissingCurrentState as an Error", () => {
    const error = new MissingCurrentState("No active state")

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("No active state")
  })

  test("should include item.toString output in UnknownStateReturnType message", () => {
    const value = {
      toString: () => "mystery-return",
    }

    const error = new UnknownStateReturnType(value)

    expect(error).toBeInstanceOf(Error)
    expect(error.item).toBe(value)
    expect(error.message).toContain("mystery-return")
  })
})
