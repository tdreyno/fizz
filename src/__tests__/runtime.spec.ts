import { Enter, enter, createAction, ActionCreatorType } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { stateWrapper } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Runtime", () => {
  test("should transition through multiple states", () => {
    const A = stateWrapper("A", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return B()
      }
    })

    const B = stateWrapper("B", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect(runtime.currentState().name).toBe("A")

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("B")
    })

    jest.runAllTimers()
  })

  test("should run the action returned", () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = stateWrapper("A", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return trigger()

        case "Trigger":
          return B()
      }
    })

    const B = stateWrapper("B", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("B")
    })

    jest.runAllTimers()
  })
})
