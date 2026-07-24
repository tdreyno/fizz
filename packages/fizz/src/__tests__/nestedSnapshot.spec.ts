import type { Enter } from "../action"
import { action, enter } from "../action"
import { createMachine } from "../createMachine"
import { noop } from "../effect"
import { NESTED, stateWithNested } from "../nested"
import { createRuntime, Runtime } from "../runtime"
import { getSnapshot, restoreRuntime, SnapshotRestoreError } from "../snapshot"
import type { BoundStateFn } from "../state"
import { state } from "../state"

const advance = action("Advance")
type Advance = ReturnType<typeof advance>

const ChildB: BoundStateFn<"ChildB", Enter | Advance, { step: number }> = state<
  Enter | Advance,
  { step: number }
>(
  {
    Advance: data => ChildB({ step: data.step + 1 }),
    Enter: noop,
  },
  { name: "ChildB" },
)

const ChildA = state<Enter | Advance, { step: number }>(
  {
    Advance: data => ChildB({ step: data.step + 1 }),
    Enter: noop,
  },
  { name: "ChildA" },
)

const makeEntry = (withStates: boolean) =>
  stateWithNested<Enter, { label: string }>(
    {
      Enter: noop,
    },
    ChildA({ step: 0 }),
    { Advance: advance },
    {
      name: "Entry",
      ...(withStates ? { states: { ChildA, ChildB } } : {}),
    },
  )

const currentChild = (runtime: Runtime<any, any>) =>
  (
    runtime.currentState().data as {
      [NESTED]: Runtime<any, any>
    }
  )[NESTED].currentState()

describe("nested machine snapshots", () => {
  const Entry = makeEntry(true)
  const machine = createMachine({
    actions: { advance },
    states: { Entry },
  })

  const buildSnapshot = async () => {
    const runtime = createRuntime(machine, Entry({ label: "form" }))

    await runtime.run(enter())
    await runtime.run(advance())

    return getSnapshot(runtime)
  }

  test("should capture the nested runtime's state recursively", async () => {
    const snapshot = await buildSnapshot()
    const entry = snapshot.history[0]!

    expect(entry.name).toBe("Entry")
    expect(entry.data).toEqual({ label: "form" })
    expect(entry.nested?.history[0]).toEqual({
      data: { step: 1 },
      mode: "append",
      name: "ChildB",
    })
  })

  test("should restore the nested runtime to the snapshotted state", async () => {
    const snapshot = await buildSnapshot()
    const restored = await restoreRuntime(machine, snapshot)

    const child = currentChild(restored)

    expect(child.name).toBe("ChildB")
    expect((child.data as { step: number }).step).toBe(1)
  })

  test("should keep forwarding actions to the restored nested runtime", async () => {
    const snapshot = await buildSnapshot()
    const restored = await restoreRuntime(machine, snapshot)

    await restored.run(advance())

    expect(currentChild(restored).data).toEqual({ step: 2 })
  })

  test("should reject restore when stateWithNested lacks a states lookup", async () => {
    const BareEntry = makeEntry(false)
    const bareMachine = createMachine({
      actions: { advance },
      states: { Entry: BareEntry },
    })
    const snapshot = await buildSnapshot()

    await expect(restoreRuntime(bareMachine, snapshot)).rejects.toThrow(
      SnapshotRestoreError,
    )
  })
})
