import { jest } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { action } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { Runtime } from "../runtime"
import type { StateReturn } from "../state"
import { stateWrapper } from "../state"

describe("Bound actions", () => {
  test("should run sequentially when called at the same time", async () => {
    const add = action("Add").withPayload<number>()
    type Add = ActionCreatorType<typeof add>

    const multiply = action("Multiply").withPayload<number>()
    type Multiply = ActionCreatorType<typeof multiply>
    const reset = action("Reset")

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

    const runtime = new Runtime(context, { add, multiply, reset })

    const boundActions = runtime.bindActions({ add, multiply, reset })
    const typedAdd: (payload: number) => { asPromise: () => Promise<void> } =
      boundActions.add
    const typedMultiply: (payload: number) => {
      asPromise: () => Promise<void>
    } = boundActions.multiply
    const typedReset: () => { asPromise: () => Promise<void> } =
      boundActions.reset

    const onChange = jest.fn()
    runtime.onContextChange(onChange)

    expect(typeof typedAdd).toBe("function")
    expect(typeof typedMultiply).toBe("function")
    expect(typeof typedReset).toBe("function")

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
