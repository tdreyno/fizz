import type { Enter } from "../action.js"
import { action, enter } from "../action.js"
import { createInitialContext } from "../context.js"
import { effect, output } from "../effect.js"
import { Runtime } from "../runtime.js"
import { state } from "../state.js"

describe("nested handler return arrays", () => {
  test("should flatten one level of nested arrays returned from a handler", async () => {
    const notice = action("Notice").withPayload<string>()
    const fired: string[] = []

    const group = (...labels: string[]) =>
      labels.map(label =>
        effect("custom", label, () => {
          fired.push(label)
        }),
      )

    const A = state<Enter>(
      {
        Enter: () => [
          effect("custom", "first", () => {
            fired.push("first")
          }),
          group("second", "third"),
          output(notice("hi")),
        ],
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])
    const runtime = new Runtime(context, {}, { notice })
    const outputs: string[] = []
    runtime.onOutputType("Notice", payload => {
      outputs.push(payload)
    })

    await runtime.run(enter())

    expect(fired).toEqual(["first", "second", "third"])
    expect(outputs).toEqual(["hi"])
  })

  test("should accept a bare nested array (single sub-array) as a handler return", async () => {
    const fired: string[] = []
    const group = () => [
      effect("custom", "a", () => {
        fired.push("a")
      }),
      effect("custom", "b", () => {
        fired.push("b")
      }),
    ]

    const A = state<Enter>(
      {
        // Single helper call that returns an array, no spread required
        Enter: () => [group()],
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])
    const runtime = new Runtime(context, {}, { enter })

    await runtime.run(enter())

    expect(fired).toEqual(["a", "b"])
  })

  test("should flatten nested arrays returned from an async handler", async () => {
    const fired: string[] = []
    const group = () => [
      effect("custom", "x", () => {
        fired.push("x")
      }),
      effect("custom", "y", () => {
        fired.push("y")
      }),
    ]

    const A = state<Enter>(
      {
        Enter: async () => {
          await Promise.resolve()
          return [
            effect("custom", "before", () => {
              fired.push("before")
            }),
            group(),
          ]
        },
      },
      { name: "A" },
    )

    const context = createInitialContext([A()])
    const runtime = new Runtime(context, {}, { enter })

    await runtime.run(enter())

    expect(fired).toEqual(["before", "x", "y"])
  })
})
