import { Enter, enter, createAction, ActionCreatorType } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { state } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Fallbacks", () => {
  const trigger = createAction("Trigger")
  type Trigger = ActionCreatorType<typeof trigger>

  const A = state<Enter, string>(
    {
      Enter: noop,
    },
    { debugName: "A" },
  )

  const B = state<Enter, string>(
    {
      Enter: noop,
    },
    { debugName: "B" },
  )

  test("should run fallback", () => {
    const Fallback = state<Trigger, ReturnType<typeof A | typeof B>>({
      Trigger: currentState => {
        const [name] = currentState.data
        return B(name + name)
      },
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"], Fallback)

    expect.assertions(4)
    expect(runtime.currentState().is(A)).toBeTruthy()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().is(A)).toBeTruthy()

      runtime.run(trigger()).fork(jest.fn(), () => {
        expect(runtime.currentState().is(B)).toBeTruthy()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(runtime.currentState().data).toBe("TestTest")
      })
    })

    jest.runAllTimers()
  })

  test("should run fallback which reenters current state", () => {
    const Fallback = state<Trigger, ReturnType<typeof A | typeof B>>({
      Trigger: currentState => {
        const [name] = currentState.data
        return currentState.reenter(name + name)
      },
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, [], Fallback)

    expect.assertions(4)
    expect(runtime.currentState().is(A)).toBeTruthy()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().is(A)).toBeTruthy()

      runtime.run(trigger()).fork(jest.fn(), () => {
        expect(runtime.currentState().is(A)).toBeTruthy()
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        expect(runtime.currentState().data).toBe("TestTest")
      })
    })

    jest.runAllTimers()
  })
})
