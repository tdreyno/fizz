import { enter, Enter } from "../action"
import { createInitialContext } from "../context"
import { isState, state } from "../state"
import { createRuntime } from "../runtime"

describe("Default data", () => {
  test("should empty tuple data", async () => {
    const A = state<Enter, [number]>(
      {
        Enter: data => B(data),
      },
      { name: "A" },
    )

    const B = state<Enter, [number, string?]>(
      {
        Enter: ([num], _, { update }) => update([num, "2"]),
      },
      { name: "B" },
    )

    const context = createInitialContext([A([1])])

    const runtime = createRuntime(context)

    await runtime.run(enter())

    const s = runtime.currentState()

    expect(s.isNamed("B")).toBeTruthy()

    if (!isState(s, B)) {
      throw new Error()
    }

    expect(s.data[1]).toBe("2")
  })
})
