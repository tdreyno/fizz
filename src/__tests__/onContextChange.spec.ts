import { Action, Enter, enter } from "../action"
import { StateReturn, stateWrapper } from "../state"

import { createInitialContext } from "./createInitialContext"
import { createRuntime } from "../runtime"
import { noop } from "../effect"

describe.skip("onContextChange", () => {
  test("should run callback once after changes", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const A = stateWrapper("A", (action: Enter, _name: string) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    await runtime.run(enter())

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test("should run callback once on update", async () => {
    interface Trigger {
      type: "Trigger"
    }

    const A = stateWrapper(
      "A",
      (action: Trigger, name: string, { update }): StateReturn => {
        switch (action.type) {
          case "Trigger":
            return update(name + name)
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"])

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    await runtime.run({ type: "Trigger" } as Action<"Trigger", undefined>)

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
