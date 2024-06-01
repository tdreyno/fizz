/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { jest } from "@jest/globals"
import {
  type ActionCreatorType,
  type Enter,
  createAction,
  enter,
} from "../action"
import { Context, createInitialContext } from "../context"
import { createRuntime } from "../runtime"
import { noop } from "../effect"
import { state } from "../state"

describe("onContextChange", () => {
  test("should run callback once after changes", async () => {
    const A = state<Enter, string>(
      {
        Enter: noop,
      },
      { name: "A" },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    await runtime.run(enter())

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test("should run callback on update", async () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger, number>(
      {
        Enter: (n, _, { update }) => [update(n + 1), trigger()],
        Trigger: async (n, _, { update }) => update(n + 1),
      },
      { name: "A" },
    )

    const context = createInitialContext([A(1)])

    const runtime = createRuntime(context, { trigger })

    let i = 0
    const onChange = jest.fn((context: Context) => {
      const { data } = context.currentState

      if (i++ == 0) {
        expect(data).toBe(2)
      } else {
        expect(data).toBe(3)
      }
    })

    expect.assertions(3)

    runtime.onContextChange(onChange)

    await runtime.run(enter())
  })
})
