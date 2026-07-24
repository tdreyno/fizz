import type { Enter } from "../action"
import { action, enter } from "../action"
import { createMachine } from "../createMachine"
import { goBack, noop } from "../effect"
import { createRuntime } from "../runtime"
import {
  getSnapshot,
  parseSnapshot,
  restoreRuntime,
  serializeSnapshot,
  SnapshotRestoreError,
} from "../snapshot"
import type { BoundStateFn } from "../state"
import { state } from "../state"

const next = action("Next").withPayload<{ count: number }>()
type Next = ReturnType<typeof next>
const bump = action("Bump").withPayload<{ count: number }>()
type Bump = ReturnType<typeof bump>

describe("getSnapshot", () => {
  const Idle = state<Enter | Next>(
    {
      Enter: noop,
      Next: (_, payload) => Active({ count: payload.count }),
    },
    { name: "Idle" },
  )

  const Active: BoundStateFn<"Active", Enter | Next | Bump, { count: number }> =
    state<Enter | Next | Bump, { count: number }>(
      {
        Bump: (data, payload, { update }) =>
          update({ count: data.count + payload.count }),
        Enter: noop,
        Next: (data, payload) => Active({ count: data.count + payload.count }),
      },
      { name: "Active" },
    )

  const machine = createMachine({
    actions: { bump, next },
    states: { Active, Idle },
  })

  test("should capture the current state name and data", async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())
    await runtime.run(next({ count: 2 }))

    const snapshot = getSnapshot(runtime)

    expect(snapshot.version).toBe(1)
    expect(snapshot.history[0]).toEqual({
      data: { count: 2 },
      mode: "append",
      name: "Active",
    })
  })

  test("should capture history newest-first including updates", async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())
    await runtime.run(next({ count: 1 }))
    await runtime.run(next({ count: 4 }))
    await runtime.run(bump({ count: 10 }))

    const snapshot = getSnapshot(runtime)

    expect(snapshot.history.map(entry => entry.name)).toEqual([
      "Active",
      "Active",
      "Idle",
    ])
    expect(snapshot.history[0]!.mode).toBe("update")
    expect(snapshot.history[0]!.data).toEqual({ count: 15 })
  })

  test("should cap captured history with maxHistory", async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())
    await runtime.run(next({ count: 1 }))
    await runtime.run(next({ count: 1 }))

    const snapshot = getSnapshot(runtime, { maxHistory: 2 })

    expect(snapshot.history).toHaveLength(2)
    expect(snapshot.history[0]!.name).toBe("Active")
  })

  test("should record a caller-provided machine name", async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())

    expect(getSnapshot(runtime, { machineName: "Counter" }).machineName).toBe(
      "Counter",
    )
    expect(getSnapshot(runtime).machineName).toBeUndefined()
  })

  test("should capture undefined data for data-less states", async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())

    const snapshot = getSnapshot(runtime)

    expect(snapshot.history[0]).toEqual({
      data: undefined,
      mode: "append",
      name: "Idle",
    })
  })
})

const back = action("Back")
type Back = ReturnType<typeof back>

describe("restoreRuntime", () => {
  const entered: string[] = []

  beforeEach(() => {
    entered.length = 0
  })

  const Idle = state<Enter | Next>(
    {
      Enter: () => {
        entered.push("Idle")
        return undefined
      },
      Next: (_, payload) => Active({ count: payload.count }),
    },
    { name: "Idle" },
  )

  const Active: BoundStateFn<"Active", Enter | Next | Back, { count: number }> =
    state<Enter | Next | Back, { count: number }>(
      {
        Back: () => goBack(),
        Enter: data => {
          entered.push(`Active:${data.count}`)
          return undefined
        },
        Next: (data, payload) => Active({ count: data.count + payload.count }),
      },
      { name: "Active" },
    )

  const machine = createMachine({
    actions: { back, next },
    states: { Active, Idle },
  })

  const buildSnapshot = async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())
    await runtime.run(next({ count: 3 }))

    return getSnapshot(runtime)
  }

  test("should restore the current state and data", async () => {
    const snapshot = await buildSnapshot()
    const restored = await restoreRuntime(machine, snapshot)

    const current = restored.currentState()

    expect(current.name).toBe("Active")
    expect(current.data).toEqual({ count: 3 })
  })

  test("should re-run enter lifecycle by default", async () => {
    const snapshot = await buildSnapshot()

    entered.length = 0
    await restoreRuntime(machine, snapshot)

    expect(entered).toEqual(["Active:3"])
  })

  test("should skip lifecycle when runLifecycle is false", async () => {
    const snapshot = await buildSnapshot()

    entered.length = 0
    await restoreRuntime(machine, snapshot, { runLifecycle: false })

    expect(entered).toEqual([])
  })

  test("should restore history so goBack returns to prior states", async () => {
    const snapshot = await buildSnapshot()
    const restored = await restoreRuntime(machine, snapshot)

    await restored.run(back())

    expect(restored.currentState().name).toBe("Idle")
  })

  test("should bound restored history with maxHistory", async () => {
    const snapshot = await buildSnapshot()
    const restored = await restoreRuntime(machine, snapshot, {
      maxHistory: 1,
      runLifecycle: false,
    })

    expect(restored.currentHistory().length).toBe(1)
  })

  test("should throw SnapshotRestoreError for unknown state names", async () => {
    const snapshot = await buildSnapshot()

    snapshot.history[0]!.name = "Missing"

    await expect(restoreRuntime(machine, snapshot)).rejects.toThrow(
      SnapshotRestoreError,
    )
  })

  test("should throw SnapshotRestoreError for unsupported versions", async () => {
    const snapshot = await buildSnapshot()

    ;(snapshot as { version: number }).version = 99

    await expect(restoreRuntime(machine, snapshot)).rejects.toThrow(
      SnapshotRestoreError,
    )
  })

  test("should throw SnapshotRestoreError for empty history", async () => {
    const snapshot = await buildSnapshot()

    snapshot.history = []

    await expect(restoreRuntime(machine, snapshot)).rejects.toThrow(
      SnapshotRestoreError,
    )
  })
})

describe("serializeSnapshot and parseSnapshot", () => {
  const Idle = state<Enter>(
    {
      Enter: noop,
    },
    { name: "Idle" },
  )

  const machine = createMachine({ states: { Idle } })

  const buildSnapshot = async () => {
    const runtime = createRuntime(machine, Idle())

    await runtime.run(enter())

    return getSnapshot(runtime)
  }

  test("should round-trip a snapshot through JSON", async () => {
    const snapshot = await buildSnapshot()
    const parsed = parseSnapshot(serializeSnapshot(snapshot))

    expect(parsed).toEqual(snapshot)
  })

  test("should support replacer and reviver for custom data", async () => {
    const snapshot = await buildSnapshot()

    snapshot.history[0]!.data = { tags: new Map([["a", 1]]) }

    const json = serializeSnapshot(snapshot, {
      replacer: (_, value) =>
        value instanceof Map
          ? { __type: "Map", entries: [...value.entries()] }
          : value,
    })

    const parsed = parseSnapshot(json, {
      reviver: (_, value) =>
        typeof value === "object" &&
        value !== null &&
        (value as { __type?: string }).__type === "Map"
          ? new Map((value as { entries: [string, number][] }).entries)
          : value,
    })

    expect(
      (parsed.history[0]!.data as { tags: Map<string, number> }).tags,
    ).toEqual(new Map([["a", 1]]))
  })

  test("should reject JSON with an unsupported version", () => {
    expect(() =>
      parseSnapshot(JSON.stringify({ history: [], version: 99 })),
    ).toThrow(SnapshotRestoreError)
  })

  test("should reject JSON that is not a snapshot shape", () => {
    expect(() => parseSnapshot(JSON.stringify({ nope: true }))).toThrow(
      SnapshotRestoreError,
    )
    expect(() => parseSnapshot("[]")).toThrow(SnapshotRestoreError)
  })

  test("should reject history entries missing required fields", () => {
    expect(() =>
      parseSnapshot(JSON.stringify({ history: [{ data: {} }], version: 1 })),
    ).toThrow(SnapshotRestoreError)
  })
})
