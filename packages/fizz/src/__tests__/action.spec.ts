import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType } from "../action"
import * as actionModule from "../action"

const { action, enter, intervalStarted } = actionModule

type LegacyCreateAction = <T extends string, P = undefined>(
  type: T,
) => ((payload: P) => { payload: P; type: T }) & {
  is(action: { type: string }): boolean
  type: T
}

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
    const legacy = (
      Reflect.get(actionModule, "createAction") as LegacyCreateAction
    )<"Legacy", number>("Legacy")

    expect(legacy(4)).toEqual({
      payload: 4,
      type: "Legacy",
    })
    expect(enter()).toEqual({
      payload: undefined,
      type: "Enter",
    })
  })

  test("should create interval lifecycle actions with intervalId payloads", () => {
    expect(intervalStarted({ intervalId: "heartbeat", delay: 2500 })).toEqual({
      payload: {
        delay: 2500,
        intervalId: "heartbeat",
      },
      type: "IntervalStarted",
    })
  })
})
