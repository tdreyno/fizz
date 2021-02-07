/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Task } from "@tdreyno/pretty-please"
import { Enter } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { state, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Bound actions", () => {
  test("should run sequentially when called at the same time", () => {
    interface Add {
      type: "Add"
      amount: number
    }

    interface Multiply {
      type: "Multiply"
      amount: number
    }

    const A = state(
      "A",
      (action: Enter | Add | Multiply, count: number): StateReturn => {
        switch (action.type) {
          case "Enter":
            return noop()

          case "Add":
            return A.update(count + action.amount)

          case "Multiply":
            return A.update(count * action.amount)
        }
      },
    )

    const context = createInitialContext([A(0)])

    const runtime = createRuntime(context, ["Add", "Multiply"])

    const onChange = jest.fn()
    runtime.onContextChange(onChange)

    expect.hasAssertions()

    Task.all([
      runtime.run({ type: "Add", amount: 2 } as Add),
      runtime.run({ type: "Multiply", amount: 2 } as Multiply),
      runtime.run({ type: "Add", amount: 3 } as Add),
      runtime.run({ type: "Multiply", amount: 5 } as Multiply),
      runtime.run({ type: "Add", amount: 1 } as Add),
    ]).fork(jest.fn(), () => {
      expect(runtime.currentState().data[0]).toBe(36)
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    jest.runAllTimers()
  })
})
