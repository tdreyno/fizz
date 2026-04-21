import { describe, expect, test } from "@jest/globals"

import { action, enter, intervalTriggered, timerCompleted } from "../action"
import { createMachine } from "../createMachine"
import { describeState, state, withDebouncedAction, withRetry } from "../fluent"
import { createRuntime } from "../runtime"
import { state as objectState } from "../state"

describe("Fluent state API", () => {
  test("should register handlers via creator references", async () => {
    const setName = action("SetName").withPayload<{ name: string }>()

    const Editing = state<{ name: string; saves: number }>("Editing")
      .onEnter((data, _, { update }) => update(data))
      .on(setName, (data, payload, { update }) =>
        update({
          ...data,
          name: payload.name,
        }),
      )

    const machine = createMachine({
      actions: { setName },
      states: { Editing },
    })

    const runtime = createRuntime(machine, Editing({ name: "A", saves: 0 }))

    await runtime.run(enter())
    await runtime.run(setName({ name: "B" }))

    const current = runtime.currentState()

    if (current.name !== Editing.name) {
      throw new Error("Expected Editing state")
    }

    expect((current.data as { name: string }).name).toBe("B")
  })

  test("should support guards via when and unless", async () => {
    const incrementWhenEnabled = action("IncrementWhenEnabled")
    const incrementWhenDisabled = action("IncrementWhenDisabled")

    const Counting = state<{ count: number; enabled: boolean }>("Counting")
      .on(incrementWhenEnabled, (data, _, { update }) =>
        update({
          ...data,
          count: data.count + 1,
        }),
      )
      .when(data => data.enabled)
      .on(incrementWhenDisabled, (data, _, { update }) =>
        update({
          ...data,
          count: data.count + 100,
        }),
      )
      .unless(data => data.enabled)

    const machine = createMachine({
      actions: { incrementWhenEnabled, incrementWhenDisabled },
      states: { Counting },
    })

    const runtimeEnabled = createRuntime(
      machine,
      Counting({ count: 0, enabled: true }),
    )

    await runtimeEnabled.run(incrementWhenEnabled())
    await runtimeEnabled.run(incrementWhenDisabled())

    const enabledState = runtimeEnabled.currentState()

    if (enabledState.name !== Counting.name) {
      throw new Error("Expected Counting state")
    }

    expect((enabledState.data as { count: number }).count).toBe(1)

    const runtimeDisabled = createRuntime(
      machine,
      Counting({ count: 0, enabled: false }),
    )

    await runtimeDisabled.run(incrementWhenEnabled())
    await runtimeDisabled.run(incrementWhenDisabled())

    const disabledState = runtimeDisabled.currentState()

    if (disabledState.name !== Counting.name) {
      throw new Error("Expected Counting state")
    }

    expect((disabledState.data as { count: number }).count).toBe(100)
  })

  test("should route timer and interval handlers", async () => {
    type Data = {
      events: string[]
    }

    const Tracking = state<Data>("Tracking")
      .onTimeout("autosave", (data, _payload, { update }) =>
        update({
          ...data,
          events: [...data.events, "timer:autosave"],
        }),
      )
      .onInterval("heartbeat", (data, _payload, { update }) =>
        update({
          ...data,
          events: [...data.events, "interval:heartbeat"],
        }),
      )

    const machine = createMachine({
      states: { Tracking },
    })

    const runtime = createRuntime(machine, Tracking({ events: [] }))

    await runtime.run(
      timerCompleted({
        timeoutId: "autosave",
        delay: 100,
      }),
    )

    await runtime.run(
      intervalTriggered({
        intervalId: "heartbeat",
        delay: 100,
      }),
    )

    const current = runtime.currentState()

    if (current.name !== Tracking.name) {
      throw new Error("Expected Tracking state")
    }

    expect((current.data as { events: string[] }).events).toEqual([
      "timer:autosave",
      "interval:heartbeat",
    ])
  })

  test("should expose state description metadata", () => {
    const save = action("Save")

    const Editing = state<{ id: string }>("Editing")
      .on(save, (data, _, { update }) => update(data))
      .onTimeout("autosave", (data, _, { update }) => update(data))
      .onInterval("heartbeat", (data, _, { update }) => update(data))

    expect(Editing.describe()).toEqual({
      name: "Editing",
      actionTypes: ["IntervalTriggered", "Save", "TimerCompleted"],
      timeoutIds: ["autosave"],
      intervalIds: ["heartbeat"],
    })

    expect(describeState(Editing)).toEqual(Editing.describe())
  })

  test("should throw on duplicate action handler registration", () => {
    const save = action("Save")

    const register = () =>
      state<{ id: string }>("Editing")
        .on(save, (data, _, { update }) => update(data))
        .on(save, (data, _, { update }) => update(data))

    expect(register).toThrow("duplicate handler")
  })

  test("should provide debounced utility registration", () => {
    const save = action("Save")

    const Editing = withDebouncedAction(
      state<{ count: number }>("Editing"),
      save,
      250,
      (data, _, { update }) =>
        update({
          ...data,
          count: data.count + 1,
        }),
    )

    const base = objectState<ReturnType<typeof save>, { count: number }>(
      {
        Save: (data, _, { update }) =>
          update({
            ...data,
            count: data.count + 1,
          }),
      },
      { name: "Base" },
    )

    expect(Editing.name).toBe("Editing")
    expect(base.name).toBe("Base")
  })

  test("should retry async work with withRetry helper", async () => {
    let attempts = 0

    const run = withRetry(async () => {
      attempts += 1

      if (attempts < 3) {
        throw new Error("not yet")
      }

      return "ok"
    })

    await expect(run()).resolves.toBe("ok")
    expect(attempts).toBe(3)
  })
})
