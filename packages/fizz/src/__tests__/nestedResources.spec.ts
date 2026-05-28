import type { Action, ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { noop, resource } from "../effect"
import { NESTED, stateWithNested } from "../nested"
import { Runtime } from "../runtime"
import { state } from "../state"

const getNestedRuntime = (
  runtime: Runtime<
    Record<string, (...args: Array<unknown>) => Action<string, unknown>>,
    Record<string, (...args: Array<unknown>) => Action<string, unknown>>
  >,
) =>
  (
    runtime.currentState().data as {
      [NESTED]?: Runtime<
        Record<string, (...args: Array<unknown>) => Action<string, unknown>>,
        Record<string, (...args: Array<unknown>) => Action<string, unknown>>
      >
    }
  )[NESTED]

describe("nested resources", () => {
  test("should expose parent resources to nested child handlers", async () => {
    const probeShared = action("ProbeShared")

    type ProbeShared = ActionCreatorType<typeof probeShared>

    const Child = state<ProbeShared, { seen: number; sharedSeen?: string }>(
      {
        ProbeShared: (data, _, { resources, update }) =>
          update({
            ...data,
            sharedSeen: String(resources.sharedListener),
            seen: data.seen + 1,
          }),
      },
      { name: "Child" },
    )

    const Entry = stateWithNested<Enter, undefined>(
      {
        Enter: () => resource("sharedListener", "attached"),
      },
      Child({ seen: 0 }),
      {
        ProbeShared: probeShared,
      },
      { name: "Entry" },
    )

    const runtime = new Runtime(createInitialContext([Entry()]), {
      probeShared,
    })

    await runtime.run(enter())
    await runtime.run(probeShared())

    const nestedRuntime = getNestedRuntime(runtime)

    if (!nestedRuntime) {
      throw new Error("Expected nested runtime")
    }

    const nestedCurrent = nestedRuntime.currentState()

    expect(nestedCurrent.is(Child)).toBeTruthy()

    if (!nestedCurrent.is(Child)) {
      throw new Error("Expected Child state")
    }

    expect(nestedCurrent.data.sharedSeen).toBe("attached")
  })

  test("should keep parent resources stable across nested transitions", async () => {
    const probeShared = action("ProbeShared")
    const toggleChild = action("ToggleChild")
    const leave = action("Leave")

    type ProbeShared = ActionCreatorType<typeof probeShared>
    type ToggleChild = ActionCreatorType<typeof toggleChild>
    type Leave = ActionCreatorType<typeof leave>
    type ChildState = ReturnType<
      typeof state<ProbeShared | ToggleChild, { seen?: string }>
    >

    const childStates = {} as {
      A: ChildState
      B: ChildState
    }

    childStates.A = state<ProbeShared | ToggleChild, { seen?: string }>(
      {
        ProbeShared: (data, _, { resources, update }) =>
          update({
            ...data,
            seen: `A:${String(resources.sharedListener)}`,
          }),
        ToggleChild: () => childStates.B(),
      },
      { name: "ChildA" },
    )

    childStates.B = state<ProbeShared | ToggleChild, { seen?: string }>(
      {
        ProbeShared: (data, _, { resources, update }) =>
          update({
            ...data,
            seen: `B:${String(resources.sharedListener)}`,
          }),
        ToggleChild: () => childStates.A(),
      },
      { name: "ChildB" },
    )

    const ChildA = childStates.A
    const ChildB = childStates.B

    const teardownCalls: string[] = []

    const Done = state<Enter, undefined>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Entry = stateWithNested<Enter | Leave, undefined>(
      {
        Enter: () =>
          resource("sharedListener", "attached", () => {
            teardownCalls.push("released")
          }),
        Leave: () => Done(),
      },
      ChildA({}),
      {
        ProbeShared: probeShared,
        ToggleChild: toggleChild,
      },
      { name: "Entry" },
    )

    const runtime = new Runtime(createInitialContext([Entry()]), {
      leave,
      probeShared,
      toggleChild,
    })

    await runtime.run(enter())
    await runtime.run(probeShared())

    const nestedRuntimeA = getNestedRuntime(runtime)

    if (!nestedRuntimeA) {
      throw new Error("Expected nested runtime")
    }

    const childA = nestedRuntimeA.currentState()

    expect(childA.is(ChildA)).toBeTruthy()

    if (!childA.is(ChildA)) {
      throw new Error("Expected ChildA state")
    }

    expect(childA.data.seen).toBe("A:attached")

    await runtime.run(toggleChild())
    await runtime.run(probeShared())

    const nestedRuntimeB = getNestedRuntime(runtime)

    if (!nestedRuntimeB) {
      throw new Error("Expected nested runtime")
    }

    const childB = nestedRuntimeB.currentState()

    expect(childB.is(ChildB)).toBeTruthy()

    if (!childB.is(ChildB)) {
      throw new Error("Expected ChildB state")
    }

    expect(childB.data.seen).toBe("B:attached")

    expect(teardownCalls).toEqual([])

    await runtime.run(leave())

    const current = runtime.currentState()

    expect(current.is(Done)).toBeTruthy()

    if (!current.is(Done)) {
      throw new Error("Expected Done state")
    }

    expect(teardownCalls).toEqual(["released"])
  })

  test("should prefer child resources when keys overlap with parent resources", async () => {
    const probeShared = action("ProbeShared")

    type ProbeShared = ActionCreatorType<typeof probeShared>

    const Child = state<ProbeShared | Enter, { sharedSeen?: string }>(
      {
        Enter: () => resource("sharedListener", "child"),
        ProbeShared: (data, _, { resources, update }) =>
          update({
            ...data,
            sharedSeen: String(resources.sharedListener),
          }),
      },
      { name: "Child" },
    )

    const Entry = stateWithNested<Enter, undefined>(
      {
        Enter: () => resource("sharedListener", "parent"),
      },
      Child({}),
      {
        ProbeShared: probeShared,
      },
      { name: "Entry" },
    )

    const runtime = new Runtime(createInitialContext([Entry()]), {
      probeShared,
    })

    await runtime.run(enter())
    await runtime.run(probeShared())

    const nestedRuntime = getNestedRuntime(runtime)

    if (!nestedRuntime) {
      throw new Error("Expected nested runtime")
    }

    const nestedCurrent = nestedRuntime.currentState()

    expect(nestedCurrent.is(Child)).toBeTruthy()

    if (!nestedCurrent.is(Child)) {
      throw new Error("Expected Child state")
    }

    expect(nestedCurrent.data.sharedSeen).toBe("child")
  })
})
