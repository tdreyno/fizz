import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { stateWithNested } from "../nested"
import type {
  RuntimePathTransitionInfo,
  RuntimeTransitionInfo,
} from "../runtime"
import { Runtime } from "../runtime"
import { state } from "../state"

const reveal = action("Reveal")
type Reveal = ActionCreatorType<typeof reveal>

const bump = action("Bump")
type Bump = ActionCreatorType<typeof bump>

const Opening = state<Enter | Reveal, void>(
  {
    Enter: noop,
    Reveal: () => Open(),
  },
  { name: "Opening" },
)

const Open = state<Enter, void>(
  {
    Enter: noop,
  },
  { name: "Open" },
)

const Modal = stateWithNested<
  Enter | Bump,
  { Reveal: typeof reveal },
  { count: number }
>(
  {
    Enter: noop,
    Bump: data => ({ ...data, count: data.count + 1 }),
  },
  Opening(),
  { Reveal: reveal },
  { name: "Modal" },
)

const bootModal = async () => {
  const runtime = new Runtime(createInitialContext([Modal({ count: 0 })]), {
    Bump: bump,
    Reveal: reveal,
  })

  await runtime.run(enter())

  return runtime
}

describe("Runtime#onPathTransition", () => {
  test("fires on a nested child path change while onTransition does not", async () => {
    const runtime = await bootModal()

    expect(runtime.currentStatePath()).toBe("Modal/Opening")

    const pathEvents: RuntimePathTransitionInfo[] = []
    const nameEvents: RuntimeTransitionInfo[] = []

    runtime.onPathTransition(info => pathEvents.push(info))
    runtime.onTransition(info => nameEvents.push(info))

    await runtime.run(reveal())

    expect(runtime.currentStatePath()).toBe("Modal/Open")
    expect(pathEvents).toHaveLength(1)
    expect(pathEvents[0]!.path).toBe("Modal/Open")
    expect(pathEvents[0]!.previousPath).toBe("Modal/Opening")
    expect(nameEvents).toHaveLength(0)
  })

  test("does not fire when the path is unchanged", async () => {
    const runtime = await bootModal()

    const pathEvents: RuntimePathTransitionInfo[] = []
    runtime.onPathTransition(info => pathEvents.push(info))

    await runtime.run(bump())

    expect(pathEvents).toHaveLength(0)
  })

  test("respects a custom separator", async () => {
    const runtime = await bootModal()

    const paths: string[] = []
    runtime.onPathTransition(info => paths.push(info.path), {
      separator: ".",
    })

    await runtime.run(reveal())

    expect(paths).toEqual(["Modal.Open"])
  })

  test("returns an unsubscribe that stops further notifications", async () => {
    const runtime = new Runtime(createInitialContext([Modal({ count: 0 })]), {
      Bump: bump,
      Reveal: reveal,
    })

    const paths: string[] = []
    const unsubscribe = runtime.onPathTransition(info => paths.push(info.path))

    await runtime.run(enter())
    unsubscribe()
    await runtime.run(reveal())

    expect(paths).toEqual(["Modal/Opening"])
  })
})
