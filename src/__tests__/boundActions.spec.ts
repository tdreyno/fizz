import { ActionCreatorType, Enter, createAction } from "../action"
import { StateReturn, stateWrapper } from "../state"

import { createInitialContext } from "./createInitialContext"
import { createRuntime } from "../runtime"
import { noop } from "../effect"

describe.skip("Bound actions", () => {
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

    const runtime = createRuntime(context, ["Add", "Multiply"])

    const onChange = jest.fn()
    runtime.onContextChange(onChange)

    await Promise.all([
      runtime.run(add(2)),
      runtime.run(multiply(2)),
      runtime.run(add(3)),
      runtime.run(multiply(5)),
      runtime.run(add(1)),
    ])

    expect(runtime.currentState().data).toBe(36)
    expect(onChange).toHaveBeenCalledTimes(5)
  })
})
