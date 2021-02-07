/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Enter, enter, typedAction } from "../action"
import { noop } from "../effect"
import { Runtime } from "../runtime"
import { state } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Runtime", () => {
  test("should transition through multiple states", () => {
    const A = state("A", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return B()
      }
    })

    const B = state("B", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const context = createInitialContext([A()])

    const runtime = Runtime.create(context)

    expect(runtime.currentState().name).toBe("A")

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("B")
    })

    jest.runAllTimers()
  })

  test("should run the action returned", () => {
    const trigger = typedAction("Trigger")
    type Trigger = ReturnType<typeof trigger>

    const A = state("A", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return trigger()

        case "Trigger":
          return B()
      }
    })

    const B = state("B", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const context = createInitialContext([A()])

    const runtime = Runtime.create(context, ["Trigger"])

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("B")
    })

    jest.runAllTimers()
  })
})
