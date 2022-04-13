import { ActionCreatorType, Enter, createAction, enter } from "../action"

import { createInitialContext } from "../context"
import { createRuntime } from "../runtime"
import { noop } from "../effect"
import { state } from "../state"

describe("onContextChange", () => {
  test("should run callback once after changes", async () => {
    const A = state<Enter, string>(
      {
        Enter: noop,
      },
      { name: "A" },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    await runtime.run(enter())

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test("should run callback once on update", async () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger, string>(
      {
        Enter: noop,
        Trigger: (name, _, { update }) => update(name + name),
      },
      { name: "A" },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context, ["Trigger"])

    const onChange = jest.fn()

    runtime.onContextChange(onChange)

    await runtime.run(trigger())

    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
