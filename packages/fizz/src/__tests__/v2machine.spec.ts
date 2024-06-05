import { enter } from "../action.js"
import { createInitialContext } from "../context.js"
import { createRuntime } from "../runtime.js"
import { isState } from "../state.js"
import * as LoadingMachine from "../loadingMachine/index.js"

describe("v2machine", () => {
  it("should work", async () => {
    const context = createInitialContext([LoadingMachine.States.Initializing()])

    const runtime = createRuntime(context)

    expect(
      isState(runtime.currentState(), LoadingMachine.States.Initializing),
    ).toBeTruthy()

    await runtime.run(enter())
  })
})
