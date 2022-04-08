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
})
