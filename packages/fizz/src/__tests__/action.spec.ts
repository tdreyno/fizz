import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType } from "../action"
import * as actionModule from "../action"
import { createMachine } from "../createMachine"
import { createRuntime } from "../runtime"
import { state } from "../state"

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

  test("should keep withPayload for unnamed actions", () => {
    const save = action().withPayload<{ content: string }>()
    type Save = ActionCreatorType<typeof save>

    const event: Save = save({ content: "draft" })

    expect(event).toEqual({
      payload: { content: "draft" },
      type: save.type,
    })
    expect(save.type).toContain("Action:")
  })

  test("should allow action creators as state handler keys", async () => {
    const save = action().withPayload<{ content: string }>()
    type Save = ActionCreatorType<typeof save>

    const Editing = state<Save, { content: string }>({
      [save]: (_data, payload, { update }) =>
        update({
          content: payload.content,
        }),
    })

    const runtime = createRuntime(
      createMachine({
        actions: { save },
        states: { Editing },
      }),
      Editing({ content: "before" }),
    )

    await runtime.run(save({ content: "after" }))

    const current = runtime.currentState()

    expect(current.name).toBe(Editing.name)

    if (!current.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(current.data.content).toBe("after")
  })
})
