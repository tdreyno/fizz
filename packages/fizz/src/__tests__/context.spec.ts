import { describe, expect, jest, test } from "@jest/globals"

import { Context, createInitialContext, History } from "../context.js"

type FakeState = {
  data: { count: number }
  executor: () => Array<unknown>
  isNamed: () => boolean
  isStateTransition: true
  mode: "append"
  name: string
  state: never
}

const createState = (name: string, count: number): FakeState => ({
  data: { count },
  executor: () => [],
  isNamed: () => true,
  isStateTransition: true,
  mode: "append",
  name,
  state: (() => {
    throw new Error("state should not be called")
  }) as never,
})

describe("context", () => {
  test("requires at least one history item", () => {
    expect(() => new History([])).toThrow(
      "History must contain atleast one previous (or initial) state",
    )
  })

  test("tracks current, previous, pop, and max history", () => {
    const history = new History(
      [createState("Loading", 1), createState("Idle", 0)],
      2,
    )

    history.push(createState("Done", 2))

    expect(history.current.name).toBe("Done")
    expect(history.previous?.name).toBe("Loading")
    expect(history.length).toBe(2)
    expect(history.toArray().map(item => item.name)).toEqual([
      "Done",
      "Loading",
    ])
    expect(history.pop()?.name).toBe("Done")
    expect(history.current.name).toBe("Loading")
  })

  test("exposes initial context options", () => {
    const logger = jest.fn()
    const context = createInitialContext([createState("Idle", 0)], {
      customLogger: logger,
      enableLogging: true,
      maxHistory: 3,
    })

    expect(context).toBeInstanceOf(Context)
    expect(context.currentState.name).toBe("Idle")
    expect(context.enableLogging).toBeTruthy()
    expect(context.customLogger).toBe(logger)
    expect(context.history.length).toBe(1)
  })
})
