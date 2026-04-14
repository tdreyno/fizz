import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType } from "../action"
import * as actionModule from "../action"

const { action, enter } = actionModule

describe("action", () => {
  test("should create a no-payload action creator directly from the builder", () => {
    const start = action("Start")
    type Start = ActionCreatorType<typeof start>

    const event: Start = start()

    expect(event).toEqual({
      payload: undefined,
      type: "Start",
    })
    expect(start.type).toBe("Start")
    expect(start.is(event)).toBeTruthy()
  })

  test("should create a payload-bearing action creator from withPayload", () => {
    const save = action("Save").withPayload<string>()
    type Save = ActionCreatorType<typeof save>

    const event: Save = save("hello")

    expect(event).toEqual({
      payload: "hello",
      type: "Save",
    })
    expect(save.type).toBe("Save")
    expect(save.is(event)).toBeTruthy()
  })

  test("should keep createAction working as a deprecated compatibility helper", () => {
    // eslint-disable-next-line @typescript-eslint/dot-notation, import/namespace
    // @ts-expect-error Intentionally exercises the deprecated compatibility helper.
    const legacy = actionModule["createAction"]<"Legacy", number>("Legacy")

    expect(legacy(4)).toEqual({
      payload: 4,
      type: "Legacy",
    })
    expect(enter()).toEqual({
      payload: undefined,
      type: "Enter",
    })
  })
})
