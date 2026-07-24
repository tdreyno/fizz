import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createMachine } from "../createMachine"
import { createParallelMachine, getParallelRuntimes } from "../parallelMachine"
import { createRuntime } from "../runtime"
import { getSnapshot, restoreRuntime } from "../snapshot"
import type { BoundStateFn } from "../state"
import { state } from "../state"

const step = action("Step").withPayload<number>()
type Step = ActionCreatorType<typeof step>

const Counting: BoundStateFn<"Counting", Enter | Step, { total: number }> =
  state<Enter | Step, { total: number }>(
    {
      Enter: () => undefined,
      Step: (data, payload) => Counting({ total: data.total + payload }),
    },
    { name: "Counting" },
  )

const childMachine = createMachine({
  actions: { step },
  initialState: Counting({ total: 0 }),
  states: { Counting },
})

const buildParallel = () =>
  createParallelMachine({
    left: childMachine,
    right: childMachine,
  })

describe("parallel machine snapshots", () => {
  const buildSnapshot = async (parallel: ReturnType<typeof buildParallel>) => {
    const runtime = createRuntime(parallel.machine, parallel.initialState)

    await runtime.run(enter())
    await runtime.run(parallel.actions.step!(5))

    return getSnapshot(runtime)
  }

  test("should capture each branch runtime recursively", async () => {
    const parallel = buildParallel()
    const snapshot = await buildSnapshot(parallel)
    const entry = snapshot.history[0]!

    expect(entry.name).toBe("ParallelRunning")
    expect(entry.parallel?.left?.history[0]).toEqual({
      data: { total: 5 },
      mode: "append",
      name: "Counting",
    })
    expect(entry.parallel?.right?.history[0]).toEqual({
      data: { total: 5 },
      mode: "append",
      name: "Counting",
    })
  })

  test("should restore each branch to its snapshotted state", async () => {
    const parallel = buildParallel()
    const snapshot = await buildSnapshot(parallel)

    const restored = await restoreRuntime(parallel.machine, snapshot)
    const runtimes = getParallelRuntimes(restored.currentState().data)

    expect(runtimes.left?.currentState().data).toEqual({ total: 5 })
    expect(runtimes.right?.currentState().data).toEqual({ total: 5 })
  })

  test("should keep broadcasting actions after restore", async () => {
    const parallel = buildParallel()
    const snapshot = await buildSnapshot(parallel)

    const restored = await restoreRuntime(parallel.machine, snapshot)

    await restored.run(parallel.actions.step!(2))

    const runtimes = getParallelRuntimes(restored.currentState().data)

    expect(runtimes.left?.currentState().data).toEqual({ total: 7 })
    expect(runtimes.right?.currentState().data).toEqual({ total: 7 })
  })
})
