/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Enter, enter } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { state, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("onContextChange", () => {
  test("should run callback once after changes", () => {
    const A = state("A", (action: Enter, _name: string) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    runtime.run(enter()).fork(jest.fn(), jest.fn())

    jest.runAllTimers()

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test("should run callback once on update", () => {
    interface Trigger {
      type: "Trigger"
    }

    const A = state(
      "A",
      (action: Trigger, name: string): StateReturn => {
        switch (action.type) {
          case "Trigger":
            return A.update(name + name)
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"])

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    runtime.run({ type: "Trigger" }).fork(jest.fn(), jest.fn())

    jest.runAllTimers()

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
