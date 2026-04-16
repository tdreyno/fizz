import type { Enter } from "../action"
import { enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { Runtime } from "../runtime"
import { isState, state, switch_ } from "../state"

const expectNumber = (value: number): number => value
const expectString = (value: string): string => value

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

    const runtime = new Runtime(context)
    await runtime.run(enter())

    const result = runtime.currentState()

    if (!isState(result, B)) {
      throw new Error()
    }

    result.data = "5"
  })

  test("should preserve per-state data typing in switch_ over a transition union", () => {
    const A = state<Enter, number>(
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

    const current: ReturnType<typeof A> | ReturnType<typeof B> = B("hello")

    const result = switch_<number>(current)
      .case_(A, data => {
        const value = expectNumber(data)

        // @ts-expect-error A state data should not narrow to string
        expectString(data)

        return value
      })
      .case_(B, data => {
        const value = expectString(data)

        // @ts-expect-error B state data should not narrow to number
        expectNumber(data)

        return value.length
      })
      .run()

    expect(result).toBe(5)
  })
})
