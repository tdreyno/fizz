import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createMachine } from "../createMachine"
import { createParallelMachine, getParallelRuntimes } from "../parallelMachine"
import { createRuntime } from "../runtime"
import { state } from "../state"

describe("createParallelMachine", () => {
  test("broadcasts shared actions to all parallel runtimes", async () => {
    const world = action("World")
    type World = ActionCreatorType<typeof world>

    const Ready = state<Enter>(
      {
        Enter: () => undefined,
      },
      { name: "Ready" },
    )

    const Initializing = state<Enter | World>(
      {
        Enter: () => undefined,
        World: () => Ready(),
      },
      { name: "Initializing" },
    )

    const childMachine = createMachine({
      actions: { world },
      initialState: Initializing(),
      states: { Initializing, Ready },
    })

    const parallel = createParallelMachine({
      one: childMachine,
      two: childMachine,
    })

    const runtime = createRuntime(parallel.machine, parallel.initialState)

    await runtime.run(enter())
    await runtime.run(parallel.actions.world())

    const runtimes = getParallelRuntimes(runtime.currentState().data)

    if (Object.keys(runtimes).length === 0) {
      throw new Error("Expected parallel runtimes to exist")
    }

    expect(runtimes.one?.currentState().name).toBe("Ready")
    expect(runtimes.two?.currentState().name).toBe("Ready")
  })

  test("dispatches only to runtimes that handle an action", async () => {
    const world = action("World")
    type World = ActionCreatorType<typeof world>

    const Ready = state<Enter>(
      {
        Enter: () => undefined,
      },
      { name: "Ready" },
    )

    const Initializing = state<Enter | World>(
      {
        Enter: () => undefined,
        World: () => Ready(),
      },
      { name: "Initializing" },
    )

    const Passive = state<Enter>(
      {
        Enter: () => undefined,
      },
      { name: "Passive" },
    )

    const activeMachine = createMachine({
      actions: { world },
      initialState: Initializing(),
      states: { Initializing, Ready },
    })

    const passiveMachine = createMachine({
      actions: {},
      initialState: Passive(),
      states: { Passive },
    })

    const parallel = createParallelMachine({
      active: activeMachine,
      passive: passiveMachine,
    })

    const runtime = createRuntime(parallel.machine, parallel.initialState)

    await runtime.run(enter())
    await runtime.run(parallel.actions.world())

    const runtimes = getParallelRuntimes(runtime.currentState().data)

    if (Object.keys(runtimes).length === 0) {
      throw new Error("Expected parallel runtimes to exist")
    }

    expect(runtimes.active?.currentState().name).toBe("Ready")
    expect(runtimes.passive?.currentState().name).toBe("Passive")
  })

  test("returns an empty runtime map before entry work has populated branches", () => {
    const Idle = state<Enter>(
      {
        Enter: () => undefined,
      },
      { name: "Idle" },
    )

    const childMachine = createMachine({
      actions: {},
      initialState: Idle(),
      states: { Idle },
    })

    const parallel = createParallelMachine({
      only: childMachine,
    })

    expect(getParallelRuntimes(parallel.initialState.data)).toEqual({})
  })

  test("throws when a branch machine does not define initialState", () => {
    const Idle = state<Enter>(
      {
        Enter: () => undefined,
      },
      { name: "Idle" },
    )

    const childMachine = createMachine({
      actions: {},
      states: { Idle },
    })

    expect(() =>
      createParallelMachine({
        broken: childMachine as typeof childMachine & { initialState: never },
      }),
    ).toThrow(
      'Parallel machine branch "broken" is missing initialState. Define it on the createMachine(...) result before passing it to createParallelMachine(...).',
    )
  })

  test("accepts branch machines created with withInitialState", async () => {
    const world = action("World")
    type World = ActionCreatorType<typeof world>

    const Ready = state<Enter, { didWorld: boolean }>(
      {
        Enter: () => undefined,
      },
      { name: "Ready" },
    )

    const Initializing = state<Enter | World, { didWorld: boolean }>(
      {
        Enter: () => undefined,
        World: () => Ready({ didWorld: true }),
      },
      { name: "Initializing" },
    )

    const baseMachine = createMachine({
      actions: { world },
      initialState: Initializing({ didWorld: false }),
      states: { Initializing, Ready },
    })

    const leftMachine = baseMachine.withInitialState(
      Initializing({ didWorld: false }),
    )
    const rightMachine = baseMachine.withInitialState(Ready({ didWorld: true }))

    const parallel = createParallelMachine({
      left: leftMachine,
      right: rightMachine,
    })

    const runtime = createRuntime(parallel.machine, parallel.initialState)

    await runtime.run(enter())
    await runtime.run(parallel.actions.world())

    const runtimes = getParallelRuntimes(runtime.currentState().data)

    expect(runtimes.left?.currentState().name).toBe("Ready")
    expect(runtimes.right?.currentState().name).toBe("Ready")
    expect(
      (runtimes.left?.currentState().data as { didWorld: boolean }).didWorld,
    ).toBe(true)
    expect(
      (runtimes.right?.currentState().data as { didWorld: boolean }).didWorld,
    ).toBe(true)
  })
})
