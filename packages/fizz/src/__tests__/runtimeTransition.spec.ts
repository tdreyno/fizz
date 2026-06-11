import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import type { Context } from "../context"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { stateWithNested } from "../nested"
import type { RuntimeTransitionInfo } from "../runtime"
import { Runtime } from "../runtime"
import { state } from "../state"

const next = action("Next")
type Next = ActionCreatorType<typeof next>

const bump = action("Bump")
type Bump = ActionCreatorType<typeof bump>

const A = state<Enter | Next | Bump, { count: number }>(
  {
    Enter: noop,
    Next: data => B(data),
    Bump: data => ({ count: data.count + 1 }),
  },
  { name: "A" },
)

const B = state<Enter | Next, { count: number }>(
  {
    Enter: noop,
    Next: data => C(data),
  },
  { name: "B" },
)

const C = state<Enter, { count: number }>(
  {
    Enter: noop,
  },
  { name: "C" },
)

describe("Runtime transition history", () => {
  test("getVisitedStateNames returns ordered names oldest to newest", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    await runtime.run(next())
    await runtime.run(next())

    expect(runtime.getVisitedStateNames()).toEqual(["A", "B", "C"])
  })

  test("getFlow joins visited names with a comma by default", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    await runtime.run(next())
    await runtime.run(next())

    expect(runtime.getFlow()).toBe("A,B,C")
  })

  test("getFlow respects a custom separator", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    await runtime.run(next())

    expect(runtime.getFlow(" -> ")).toBe("A -> B")
  })
})

describe("Runtime#lastAction", () => {
  test("is undefined before the first action runs", () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    expect(runtime.lastAction()).toBeUndefined()
  })

  test("reflects the most recent triggering action", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    await runtime.run(next())

    expect(runtime.lastAction()?.type).toBe("Next")

    await runtime.run(next())

    expect(runtime.lastAction()?.type).toBe("Next")
  })
})

describe("Runtime#onTransition", () => {
  test("fires with state, previousState, and triggering action on a state change", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    const transitions: RuntimeTransitionInfo[] = []
    runtime.onTransition(info => transitions.push(info))

    await runtime.run(next())

    expect(transitions).toHaveLength(1)
    expect(transitions[0]!.state.name).toBe("B")
    expect(transitions[0]!.previousState?.name).toBe("A")
    expect(transitions[0]!.action?.type).toBe("Next")
  })

  test("does not fire when the state name does not change", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    const transitions: RuntimeTransitionInfo[] = []
    runtime.onTransition(info => transitions.push(info))

    await runtime.run(bump())

    expect(transitions).toHaveLength(0)
  })

  test("returns an unsubscribe that stops further notifications", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    const transitions: RuntimeTransitionInfo[] = []
    const unsubscribe = runtime.onTransition(info => transitions.push(info))

    await runtime.run(next())
    unsubscribe()
    await runtime.run(next())

    expect(transitions).toHaveLength(1)
    expect(transitions[0]!.state.name).toBe("B")
  })
})

describe("Runtime nested flow", () => {
  const ChildA = state<Enter, void>(
    {
      Enter: noop,
    },
    { name: "ChildA" },
  )

  const Parent = stateWithNested<
    Enter,
    Record<string, never>,
    { ready: boolean }
  >(
    {
      Enter: noop,
    },
    ChildA(),
    {},
    { name: "Parent" },
  )

  test("visited names use the composed nested path", async () => {
    const runtime = new Runtime(createInitialContext([Parent({ ready: true })]))

    await runtime.run(enter())

    expect(runtime.getVisitedStateNames()).toContain("Parent/ChildA")
  })
})

describe("Runtime#onContextChange regression", () => {
  test("still receives the context as its only argument", async () => {
    const runtime = new Runtime(createInitialContext([A({ count: 0 })]))

    const seen: Context[] = []
    runtime.onContextChange(context => seen.push(context))

    await runtime.run(bump())

    expect(seen.length).toBeGreaterThan(0)
    expect(seen[0]!.currentState.name).toBe("A")
  })
})
