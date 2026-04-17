import type { Enter } from "../action"
import { enter } from "../action"
import { createInitialContext } from "../context"
import { Runtime } from "../runtime"
import { state } from "../state"

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

    const runtime = new Runtime(context)

    await runtime.run(enter())

    const s = runtime.currentState()

    expect(s.isNamed("B")).toBeTruthy()

    if (!s.is(B)) {
      throw new Error("Expected state B")
    }

    expect(s.data[1]).toBe("2")
  })
})
