import { ActionCreatorType, Enter, createAction, enter } from "../action"

import { createInitialContext } from "./createInitialContext"
import { createRuntime } from "../runtime"
import { noop } from "../effect"
import { state } from "../state"

describe("Fallbacks", () => {
  const trigger = createAction("Trigger")
  type Trigger = ActionCreatorType<typeof trigger>

  const A = state<Enter, string>(
    {
      Enter: noop,
    },
    { name: "A" },
  )

  const B = state<Enter, string>(
    {
      Enter: noop,
    },
    { name: "B" },
  )

  test("should run fallback", async () => {
    const Fallback = state<Trigger, ReturnType<typeof A | typeof B>>({
      Trigger: currentState => {
        const name = currentState.data
        return B(name + name)
      },
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"], Fallback)

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(trigger())

    expect(runtime.currentState().is(B)).toBeTruthy()
    expect(runtime.currentState().data).toBe("TestTest")
  })

  test("should run fallback which reenters current state", async () => {
    const Fallback = state<Trigger, ReturnType<typeof A | typeof B>>({
      Trigger: currentState => {
        const name = currentState.data
        return currentState.reenter(name + name)
      },
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, [], Fallback)

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(trigger())

    expect(runtime.currentState().is(A)).toBeTruthy()
    expect(runtime.currentState().data).toBe("TestTest")
  })
})
