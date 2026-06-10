import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { NESTED, stateWithNested } from "../nested"
import { Runtime } from "../runtime"
import { state } from "../state"
import { getStatePath } from "../statePath"
import { Actions, States } from "./nestedMachine"
import { setName } from "./nestedMachine/actions"

const CORRECT_TEST_NAME = "Fizz"
const INCORRECT_TEST_NAME = "Test"

const init = async () => {
  const context = createInitialContext([
    States.Entry({ targetName: CORRECT_TEST_NAME }),
  ])

  const runtime = new Runtime(context, Actions)

  await runtime.run(enter())

  return runtime
}

describe("Nested Machines", () => {
  test("should boot top-level machine and initialize sub machine", async () => {
    const runtime = await init()

    expect(runtime.currentState().is(States.Entry)).toBeTruthy()

    expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (runtime.currentState().data as any)[NESTED].currentState().name,
    ).toBe("FormInvalid")
  })

  test("should forward actions to sub machine", async () => {
    const runtime = await init()

    await runtime.run(setName(INCORRECT_TEST_NAME))

    expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (runtime.currentState().data as any)[NESTED].currentState().data.name,
    ).toBe(INCORRECT_TEST_NAME)
  })

  test("should transition sub machine", async () => {
    const runtime = await init()

    await runtime.run(setName(CORRECT_TEST_NAME))

    // Under the sync drain contract, `await run()` resolves only after every
    // action transitively triggered (including parent transitions bubbled up
    // from the nested machine via `trigger`) has been processed. The parent
    // has already moved to `Complete` by the time `run()` resolves.
    expect(runtime.currentState().name).toBe("Complete")
  })
})

describe("getStatePath", () => {
  test("returns just the state name for a flat state (no separator)", () => {
    expect(getStatePath(States.Complete())).toBe("Complete")
  })

  test("composes the parent and active child names for a nested state", async () => {
    const runtime = await init()

    expect(getStatePath(runtime.currentState())).toBe("Entry/FormInvalid")
  })

  test("reflects the path after the nested machine transitions", async () => {
    const runtime = await init()

    await runtime.run(setName(CORRECT_TEST_NAME))

    // The valid form bubbles `CompletedForm` to the parent, landing on Complete.
    expect(getStatePath(runtime.currentState())).toBe("Complete")
  })

  test("respects a custom separator", async () => {
    const runtime = await init()

    expect(getStatePath(runtime.currentState(), { separator: "." })).toBe(
      "Entry.FormInvalid",
    )
  })

  test("accepts a runtime directly", async () => {
    const runtime = await init()

    expect(getStatePath(runtime)).toBe("Entry/FormInvalid")
  })
})

describe("Runtime#currentStatePath", () => {
  test("matches getStatePath(runtime.currentState())", async () => {
    const runtime = await init()

    expect(runtime.currentStatePath()).toBe(
      getStatePath(runtime.currentState()),
    )
    expect(runtime.currentStatePath()).toBe("Entry/FormInvalid")
  })

  test("forwards the separator option", async () => {
    const runtime = await init()

    expect(runtime.currentStatePath({ separator: "." })).toBe(
      "Entry.FormInvalid",
    )
  })
})

describe("stateWithNested child-entry resolver", () => {
  type SessionData = { since: number }
  type ConnData = { resumed: boolean }

  const Live = state<Enter, SessionData>(
    { Enter: () => noop() },
    { name: "Live" },
  )
  const Stale = state<Enter, SessionData>(
    { Enter: () => noop() },
    { name: "Stale" },
  )

  const tick = action("Tick")
  type Tick = ActionCreatorType<typeof tick>

  const Connected = stateWithNested<Tick, { Tick: typeof tick }, ConnData>(
    { Tick: () => noop() },
    data => (data.resumed ? Stale({ since: 0 }) : Live({ since: 0 })),
    { Tick: tick },
    { name: "Connected" },
  )

  const bootConnected = async (resumed: boolean) => {
    const runtime = new Runtime(
      createInitialContext([Connected({ resumed })]),
      {
        Tick: tick,
      },
    )

    await runtime.run(enter())

    return runtime
  }

  test("enters the region at the resolved non-initial child", async () => {
    const runtime = await bootConnected(true)

    expect(runtime.currentStatePath()).toBe("Connected/Stale")
  })

  test("still supports the default initial child", async () => {
    const runtime = await bootConnected(false)

    expect(runtime.currentStatePath()).toBe("Connected/Live")
  })
})
