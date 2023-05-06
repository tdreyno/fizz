import { type Enter, enter } from "../action"
import { output } from "../effect"
import { createInitialContext } from "../context"
import { createRuntime } from "../runtime"
import { isState, state } from "../state"

describe("onOutput", () => {
  test("should transition through multiple states", async () => {
    const enterAction = enter()

    const A = state<Enter>(
      {
        Enter: () => output(enterAction),
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, {}, { enter })

    const fn = jest.fn()

    runtime.onOutput(action => {
      fn(action)
    })

    expect(isState(runtime.currentState(), A)).toBeTruthy()

    await runtime.run(enter())

    expect(fn).toBeCalledWith(enterAction)
  })
})
