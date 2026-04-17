import { describe, expect, test } from "@jest/globals"
import {
  createControlledTimerDriver,
  createInitialContext,
  enter,
  Runtime,
} from "@tdreyno/fizz"

import { PageOpenMachine, reset, Running } from "../pageOpenMachine.js"

describe("page open machine", () => {
  test("counts the number of seconds the page has been open", async () => {
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      createInitialContext([
        PageOpenMachine.states.Running({
          secondsOpen: 0,
        }),
      ]),
      PageOpenMachine.actions ?? {},
      {},
      { timerDriver },
    )

    await runtime.run(enter())
    await timerDriver.advanceBy(3200)

    const currentState = runtime.currentState() as ReturnType<typeof Running>

    expect(currentState.is(Running)).toBe(true)

    if (!currentState.is(Running)) {
      throw new Error("Expected Running state")
    }

    expect(currentState.data.secondsOpen).toBe(3)
  })

  test("resets the counter back to zero", async () => {
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      createInitialContext([
        PageOpenMachine.states.Running({
          secondsOpen: 0,
        }),
      ]),
      PageOpenMachine.actions ?? {},
      {},
      { timerDriver },
    )

    await runtime.run(enter())
    await timerDriver.advanceBy(2200)
    await runtime.run(reset())

    const currentState = runtime.currentState() as ReturnType<typeof Running>

    expect(currentState.is(Running)).toBe(true)

    if (!currentState.is(Running)) {
      throw new Error("Expected Running state")
    }

    expect(currentState.data.secondsOpen).toBe(0)
  })
})
