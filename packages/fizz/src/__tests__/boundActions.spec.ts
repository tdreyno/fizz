import { jest } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { createAction } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import type { StateReturn } from "../state"
import { stateWrapper } from "../state"

describe("Bound actions", () => {
  test("should run sequentially when called at the same time", async () => {
    const add = createAction<"Add", number>("Add")
    type Add = ActionCreatorType<typeof add>

    const multiply = createAction<"Multiply", number>("Multiply")
    type Multiply = ActionCreatorType<typeof multiply>

    const A = stateWrapper(
      "A",
      (
        action: Enter | Add | Multiply,
        count: number,
        { update },
      ): StateReturn => {
        switch (action.type) {
          case "Enter":
            return noop()

          case "Add":
            return update(count + action.payload)

          case "Multiply":
            return update(count * action.payload)
        }
      },
    )

    const context = createInitialContext([A(0)])

    const runtime = createRuntime(context, { add, multiply })

    const boundActions = runtime.bindActions({ add, multiply })

    const onChange = jest.fn()
    runtime.onContextChange(onChange)

    await Promise.all([
      boundActions.add(2).asPromise(),
      boundActions.multiply(2).asPromise(),
      boundActions.add(3).asPromise(),
      boundActions.multiply(5).asPromise(),
      boundActions.add(1).asPromise(),
    ])

    expect(runtime.currentState().data).toBe(36)
    expect(onChange).toHaveBeenCalledTimes(10)
  })
})
