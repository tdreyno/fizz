import type { ActionCreatorType, Enter } from "../action"
import { action } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { Runtime } from "../runtime"
import { selectWhen } from "../selectors"
import { state } from "../state"

const bump = action("Bump")
type Bump = ActionCreatorType<typeof bump>

const Counting = state<Enter | Bump, { count: number }>(
  {
    Enter: noop,
    Bump: data => ({ count: data.count + 1 }),
  },
  { name: "Counting" },
)

describe("Runtime#subscribeSelector", () => {
  test("fires the listener with the new and previous selection when it changes", async () => {
    const runtime = new Runtime(createInitialContext([Counting({ count: 0 })]))

    const selector = selectWhen(Counting, data => data.count)
    const calls: Array<{ next: number | undefined; prev: number | undefined }> =
      []

    runtime.subscribeSelector(selector, (nextValue, prevValue) => {
      calls.push({ next: nextValue, prev: prevValue })
    })

    await runtime.run(bump())
    await runtime.run(bump())

    expect(calls).toEqual([
      { next: 1, prev: 0 },
      { next: 2, prev: 1 },
    ])
  })

  test("does not fire when the selection is unchanged by equality", async () => {
    const runtime = new Runtime(createInitialContext([Counting({ count: 0 })]))

    const selector = selectWhen(Counting, () => "stable")
    const calls: string[] = []

    runtime.subscribeSelector(selector, nextValue => {
      calls.push(nextValue!)
    })

    await runtime.run(bump())
    await runtime.run(bump())

    expect(calls).toHaveLength(0)
  })

  test("emits the initial selection when emitInitial is true", async () => {
    const runtime = new Runtime(createInitialContext([Counting({ count: 5 })]))

    const selector = selectWhen(Counting, data => data.count)
    const calls: Array<{ next: number | undefined; prev: number | undefined }> =
      []

    runtime.subscribeSelector(
      selector,
      (nextValue, prevValue) => {
        calls.push({ next: nextValue, prev: prevValue })
      },
      { emitInitial: true },
    )

    expect(calls).toEqual([{ next: 5, prev: undefined }])
  })

  test("respects a custom equalityFn", async () => {
    const runtime = new Runtime(createInitialContext([Counting({ count: 0 })]))

    const selector = selectWhen(Counting, data => data.count)
    const calls: number[] = []

    runtime.subscribeSelector(
      selector,
      nextValue => {
        calls.push(nextValue!)
      },
      {
        // Treat all values as equal so the listener never fires on change.
        equalityFn: () => true,
      },
    )

    await runtime.run(bump())

    expect(calls).toHaveLength(0)
  })

  test("returns an unsubscribe that stops further notifications", async () => {
    const runtime = new Runtime(createInitialContext([Counting({ count: 0 })]))

    const selector = selectWhen(Counting, data => data.count)
    const calls: number[] = []

    const unsubscribe = runtime.subscribeSelector(selector, nextValue => {
      calls.push(nextValue!)
    })

    await runtime.run(bump())
    unsubscribe()
    await runtime.run(bump())

    expect(calls).toEqual([1])
  })
})
