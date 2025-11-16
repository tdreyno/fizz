import { jest } from "@jest/globals"

import type { Enter } from "../action"
import { enter } from "../action"
import { createInitialContext } from "../context"
import { output } from "../effect"
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

    expect(fn).toHaveBeenCalledWith(enterAction)
  })
})
