import { Action, Enter, enter } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { stateWrapper, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("onContextChange", () => {
  test("should run callback once after changes", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const A = stateWrapper("A", (action: Enter, _name: string) => {
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

    const A = stateWrapper(
      "A",
      (action: Trigger, name: string, { update }): StateReturn => {
        switch (action.type) {
          case "Trigger":
            return update(name + name)
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"])

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    runtime
      .run({ type: "Trigger" } as Action<"Trigger", undefined>)
      .fork(jest.fn(), jest.fn())

    jest.runAllTimers()

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
