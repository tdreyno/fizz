import { ActionCreatorType, Enter, createAction, enter } from "../action"

import { createInitialContext } from "./createInitialContext"
import { createRuntime } from "../runtime"
import { noop } from "../effect"
import { state } from "../state"

describe("Runtime", () => {
  test("should transition through multiple states", async () => {
    const A = state<Enter>(
      {
        Enter: () => B(),
      },
      { name: "A" },
    )

    const B = state<Enter>(
      {
        Enter: noop,
      },
      { name: "B" },
    )

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())
    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run the action returned", async () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>({
      Enter: trigger,
      Trigger: () => B(),
    })

    const B = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("onEnter actions should run in correct order", async () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const onEnter = jest.fn()

    const A = state<Enter | Trigger, { num: number }>({
      Enter: (shared, __, { update }) => {
        onEnter()
        return [update({ ...shared, num: shared.num + 1 }), trigger()]
      },

      Trigger: (shared, __, { update }) => {
        return update({ ...shared, num: shared.num + 1 })
      },
    })

    const context = createInitialContext([A({ num: 1 })])

    const runtime = createRuntime(context, ["Trigger"])

    await runtime.run(enter())

    expect(runtime.currentState().is(A)).toBeTruthy()

    expect(onEnter).toHaveBeenCalledTimes(1)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(runtime.currentState().data.num).toBe(3)
  })
})
