import { Task } from "@tdreyno/pretty-please"
import { ActionCreatorType, createAction, Enter } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { stateWrapper, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Bound actions", () => {
  test("should run sequentially when called at the same time", () => {
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

    expect.hasAssertions()

    Task.all([
      runtime.run(add(2)),
      runtime.run(multiply(2)),
      runtime.run(add(3)),
      runtime.run(multiply(5)),
      runtime.run(add(1)),
    ]).fork(jest.fn(), () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(runtime.currentState().data[0]).toBe(36)
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    jest.runAllTimers()
  })
})
