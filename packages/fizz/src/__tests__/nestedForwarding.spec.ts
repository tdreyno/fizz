import { jest } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { NESTED, stateWithNested } from "../nested"
import { Runtime } from "../runtime"
import type { BoundStateFn } from "../state"
import { state } from "../state"

const inc = action("Inc").withPayload<{ by: number }>()
const reset = action("Reset")

type Inc = ActionCreatorType<typeof inc>
type Reset = ActionCreatorType<typeof reset>

type ChildData = { count: number }

const Counting = state<Inc | Reset | Enter, ChildData>(
  {
    Enter: () => noop(),
    Inc: (data, payload) => ({ count: data.count + payload.by }),
    Reset: () => ({ count: 0 }),
  },
  { name: "Counting" },
)

type ParentData = { label: string }

type NAM = { Inc: typeof inc; Reset: typeof reset }

type NestedAccessor = {
  [NESTED]: { currentState: () => { data: ChildData } }
}

const nestedCount = (runtime: {
  currentState: () => { data: unknown }
}): number => {
  const data = runtime.currentState().data as NestedAccessor
  return data[NESTED].currentState().data.count
}

const boot = async (
  Connected: BoundStateFn<string, Inc | Reset, ParentData>,
) => {
  const runtime = new Runtime(
    createInitialContext([Connected({ label: "parent" })]),
    { Inc: inc, Reset: reset },
  )

  await runtime.run(enter())

  return runtime
}

describe("stateWithNested forwarding options", () => {
  test("forwards all nested actions by default", async () => {
    const Connected = stateWithNested<Inc | Reset, NAM, ParentData>(
      {},
      () => Counting({ count: 0 }),
      { Inc: inc, Reset: reset },
      { name: "Connected" },
    )

    const runtime = await boot(Connected)

    await runtime.run(inc({ by: 5 }))
    expect(nestedCount(runtime)).toBe(5)

    await runtime.run(reset())
    expect(nestedCount(runtime)).toBe(0)
  })

  test("forwards only the allowlisted actions", async () => {
    const Connected = stateWithNested<Inc | Reset, NAM, ParentData>(
      {},
      () => Counting({ count: 0 }),
      { Inc: inc, Reset: reset },
      { name: "Connected", forward: ["Inc"] },
    )

    const runtime = await boot(Connected)

    await runtime.run(inc({ by: 5 }))
    expect(nestedCount(runtime)).toBe(5)

    // Reset is not in the allowlist, so it is not forwarded.
    await runtime.run(reset())
    expect(nestedCount(runtime)).toBe(5)
  })

  test('forwards nothing when forward is "none"', async () => {
    const Connected = stateWithNested<Inc | Reset, NAM, ParentData>(
      {},
      () => Counting({ count: 0 }),
      { Inc: inc, Reset: reset },
      { name: "Connected", forward: "none" },
    )

    const runtime = await boot(Connected)

    await runtime.run(inc({ by: 5 }))
    expect(nestedCount(runtime)).toBe(0)
  })

  test("maps the payload before forwarding", async () => {
    const Connected = stateWithNested<Inc | Reset, NAM, ParentData>(
      {},
      () => Counting({ count: 0 }),
      { Inc: inc, Reset: reset },
      {
        name: "Connected",
        mapPayload: { Inc: payload => ({ by: payload.by * 2 }) },
      },
    )

    const runtime = await boot(Connected)

    await runtime.run(inc({ by: 3 }))
    expect(nestedCount(runtime)).toBe(6)
  })

  test("invokes beforeForward and afterForward hooks", async () => {
    const beforeForward = jest.fn()
    const afterForward = jest.fn()

    const Connected = stateWithNested<Inc | Reset, NAM, ParentData>(
      {},
      () => Counting({ count: 0 }),
      { Inc: inc, Reset: reset },
      { name: "Connected", beforeForward, afterForward },
    )

    const runtime = await boot(Connected)

    await runtime.run(inc({ by: 4 }))

    expect(beforeForward).toHaveBeenCalledTimes(1)
    expect(beforeForward).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Inc", payload: { by: 4 } }),
    )
    expect(afterForward).toHaveBeenCalledTimes(1)
    expect(afterForward).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Inc", payload: { by: 4 } }),
    )
  })

  test("passes the mapped payload to the hooks", async () => {
    const beforeForward = jest.fn()

    const Connected = stateWithNested<Inc | Reset, NAM, ParentData>(
      {},
      () => Counting({ count: 0 }),
      { Inc: inc, Reset: reset },
      {
        name: "Connected",
        mapPayload: { Inc: payload => ({ by: payload.by * 2 }) },
        beforeForward,
      },
    )

    const runtime = await boot(Connected)

    await runtime.run(inc({ by: 3 }))

    expect(beforeForward).toHaveBeenCalledWith(
      expect.objectContaining({ action: "Inc", payload: { by: 6 } }),
    )
  })
})
