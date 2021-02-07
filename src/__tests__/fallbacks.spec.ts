/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Enter, enter, typedAction } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { state, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Fallbacks", () => {
  const trigger = typedAction("Trigger")
  type Trigger = ReturnType<typeof trigger>

  const A = state("A", (action: Enter, _name: string) => {
    switch (action.type) {
      case "Enter":
        return noop()
    }
  })

  const B = state("B", (action: Enter, _name: string) => {
    switch (action.type) {
      case "Enter":
        return noop()
    }
  })

  test("should run fallback", () => {
    const Fallback = state(
      "Fallback",
      (
        action: Trigger,
        currentState: ReturnType<typeof A | typeof B>,
      ): StateReturn => {
        switch (action.type) {
          case "Trigger":
            const [name] = currentState.data
            return B(name + name)
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"], Fallback)

    expect.assertions(4)
    expect(runtime.currentState().name).toBe("A")

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("A")

      runtime.run(trigger()).fork(jest.fn(), () => {
        expect(runtime.currentState().name).toBe("B")
        expect(runtime.currentState().data[0]).toBe("TestTest")
      })
    })

    jest.runAllTimers()
  })

  test("should run fallback which reenters current state", () => {
    const Fallback = state(
      "Fallback",
      (
        action: Trigger,
        currentState: ReturnType<typeof A | typeof B>,
      ): StateReturn => {
        switch (action.type) {
          case "Trigger":
            const [name] = currentState.data
            return currentState.reenter(name + name)
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, [], Fallback)

    expect.assertions(4)
    expect(runtime.currentState().name).toBe("A")

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("A")

      runtime.run(trigger()).fork(jest.fn(), () => {
        expect(runtime.currentState().name).toBe("A")
        expect(runtime.currentState().data[0]).toBe("TestTest")
      })
    })

    jest.runAllTimers()
  })
})
