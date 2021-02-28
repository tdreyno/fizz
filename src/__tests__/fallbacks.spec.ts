import { Enter, enter, createAction, ActionCreatorType } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { stateWrapper, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Fallbacks", () => {
  const trigger = createAction("Trigger")
  type Trigger = ActionCreatorType<typeof trigger>

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const A = stateWrapper("A", (action: Enter, _name: string) => {
    switch (action.type) {
      case "Enter":
        return noop()
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const B = stateWrapper("B", (action: Enter, _name: string) => {
    switch (action.type) {
      case "Enter":
        return noop()
    }
  })

  test("should run fallback", () => {
    const Fallback = stateWrapper(
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(runtime.currentState().data[0]).toBe("TestTest")
      })
    })

    jest.runAllTimers()
  })

  test("should run fallback which reenters current state", () => {
    const Fallback = stateWrapper(
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
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(runtime.currentState().data[0]).toBe("TestTest")
      })
    })

    jest.runAllTimers()
  })
})
