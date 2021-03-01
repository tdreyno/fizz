import { Enter, enter, createAction, ActionCreatorType } from "../action"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { state } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Runtime", () => {
  test("should transition through multiple states", () => {
    const A = state<Enter>(
      {
        Enter: () => B(),
      },
      { debugName: "A" },
    )

    const B = state<Enter>(
      {
        Enter: noop,
      },
      { debugName: "B" },
    )

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect(runtime.currentState().is(A)).toBeTruthy()

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().is(B)).toBeTruthy()
    })

    jest.runAllTimers()
  })

  test("should run the action returned", () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>({
      Enter: trigger,
      Trigger: () => B(),
    })

    const B = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().is(B)).toBeTruthy()
    })

    jest.runAllTimers()
  })
})
