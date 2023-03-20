import { enter, type Enter } from "../action"
import { createInitialContext } from "../context"
import { isState, state } from "../state"
import { createRuntime } from "../runtime"
import { noop } from "../effect"

describe("Type narrowing", () => {
  test("should narrow on is", async () => {
    const A = state<Enter, number>(
      {
        Enter: n => B(n.toString()),
      },
      { name: "A" },
    )

    const B = state<Enter, string>({
      Enter: noop,
    })

    const context = createInitialContext([A(1)])

    const runtime = createRuntime(context)
    await runtime.run(enter())

    const result = runtime.currentState()

    if (!isState(result, B)) {
      throw new Error()
    }

    result.data = "5"
  })
})
