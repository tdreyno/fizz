import type { Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { Runtime } from "../runtime"
import { state, waitState } from "../state"
import { createTestHarness } from "../test"
import { timeout } from "./util"

const INITIAL_COUNT = 5
const RETURN_COUNT = 10

const fetchThing = action("FetchThing").withPayload<number>()

const thingFetched = action("ThingFetched").withPayload<number>()

type D = {
  count: number
}

const AfterThing = state<Enter, D>(
  {
    Enter: noop,
  },
  { name: "AfterThing" },
)

describe("waitState", () => {
  it("should run a wait state", async () => {
    const WaitForThing = waitState(
      fetchThing,
      thingFetched,
      (data: D, payload) => {
        return AfterThing({ ...data, count: data.count + payload })
      },
      {
        name: "WaitForThing",
      },
    )

    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

    const context = createInitialContext([
      BeforeThing({
        count: INITIAL_COUNT,
      }),
    ])

    const runtime = new Runtime(context, {}, { fetchThing })

    runtime.onOutput(action => {
      if (action.type === "FetchThing") {
        setTimeout(() => {
          void runtime.run(thingFetched(action.payload))
        }, 250)
      }
    })

    expect(runtime.currentState().is(BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(WaitForThing)).toBeTruthy()

    await timeout(500)

    expect(runtime.currentState().is(AfterThing)).toBeTruthy()
    expect((runtime.currentState().data as D).count).toBe(
      INITIAL_COUNT + RETURN_COUNT,
    )
  })

  it("should timeout", async () => {
    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

    const TimedOutState = state<Enter, D>(
      {
        Enter: noop,
      },
      { name: "TimedOutState" },
    )

    const WaitForThing = waitState(
      fetchThing,
      thingFetched,
      (data: D, payload) => {
        return AfterThing({ ...data, count: data.count + payload })
      },
      {
        name: "WaitForThing",
        timeout: 1000,
        onTimeout: data => {
          return TimedOutState(data)
        },
      },
    )
    const context = createInitialContext([
      BeforeThing({
        count: INITIAL_COUNT,
      }),
    ])

    const runtime = new Runtime(context, {}, { fetchThing })

    expect(runtime.currentState().is(BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(WaitForThing)).toBeTruthy()

    await timeout(2000)

    expect(runtime.currentState().is(TimedOutState)).toBeTruthy()
    expect((runtime.currentState().data as D).count).toBe(INITIAL_COUNT)
  })

  it("should accept async handlers", async () => {
    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

    const TimedOutState = state<Enter, D>(
      {
        Enter: noop,
      },
      { name: "TimedOutState" },
    )

    const WaitForThing = waitState(
      fetchThing,
      thingFetched,
      async (data: D, payload) => {
        return AfterThing({ ...data, count: data.count + payload })
      },
      {
        name: "WaitForThing",
        timeout: 1000,
        onTimeout: async data => {
          return TimedOutState(data)
        },
      },
    )
    const context = createInitialContext([
      BeforeThing({
        count: INITIAL_COUNT,
      }),
    ])

    const runtime = new Runtime(context, {}, { fetchThing })

    expect(runtime.currentState().is(BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(WaitForThing)).toBeTruthy()

    await timeout(2000)

    expect(runtime.currentState().is(TimedOutState)).toBeTruthy()
    expect((runtime.currentState().data as D).count).toBe(INITIAL_COUNT)
  })

  it("should be able to use respondToOutput", async () => {
    const WaitForThing = waitState(
      fetchThing,
      thingFetched,
      (data: D, payload) => {
        return AfterThing({ ...data, count: data.count + payload })
      },
      {
        name: "WaitForThing",
      },
    )

    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

    const context = createInitialContext([
      BeforeThing({
        count: INITIAL_COUNT,
      }),
    ])

    const runtime = new Runtime(context, { thingFetched }, { fetchThing })

    runtime.respondToOutput("FetchThing", async payload => {
      await timeout(250)
      return thingFetched(payload)
    })

    expect(runtime.currentState().is(BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(WaitForThing)).toBeTruthy()

    await timeout(500)

    expect(runtime.currentState().is(AfterThing)).toBeTruthy()
    expect((runtime.currentState().data as D).count).toBe(
      INITIAL_COUNT + RETURN_COUNT,
    )
  })

  it("should timeout with scheduler-backed object timeout", async () => {
    const TimedOutState = state<Enter, D>(
      {
        Enter: noop,
      },
      { name: "TimedOutState" },
    )

    const WaitForThing = waitState(
      fetchThing,
      thingFetched,
      (data: D, payload) => {
        return AfterThing({ ...data, count: data.count + payload })
      },
      {
        name: "WaitForThing",
        timeout: { delay: 1000, id: "fetchThing" },
        onTimeout: data => {
          return TimedOutState(data)
        },
      },
    )

    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

    const harness = createTestHarness({
      history: [BeforeThing({ count: INITIAL_COUNT })],
      outputActions: { fetchThing },
    })

    await harness.start()

    expect(harness.currentState().is(WaitForThing)).toBeTruthy()

    await harness.advanceBy(1000)
    await harness.settle()

    expect(harness.currentState().is(TimedOutState)).toBeTruthy()
    expect(harness.currentState().data.count).toBe(INITIAL_COUNT)
  })

  it("should ignore scheduler timeout after leaving wait state", async () => {
    const WaitForThing = waitState(
      fetchThing,
      thingFetched,
      (data: D, payload) => {
        return AfterThing({ ...data, count: data.count + payload })
      },
      {
        name: "WaitForThing",
        timeout: { delay: 1000, id: "fetchThing" },
      },
    )

    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

    const harness = createTestHarness({
      history: [BeforeThing({ count: INITIAL_COUNT })],
      internalActions: { thingFetched },
      outputActions: { fetchThing },
    })

    const reachedAfterThing = new Promise<void>(resolve => {
      const unsubscribe = harness.runtime.onContextChange(context => {
        if (context.currentState.is(AfterThing)) {
          unsubscribe()
          resolve()
        }
      })
    })

    harness.respondToOutput("FetchThing", payload => thingFetched(payload))

    await harness.start()
    await reachedAfterThing

    expect(harness.currentState().is(AfterThing)).toBeTruthy()

    await harness.advanceBy(1500)
    await harness.settle()

    expect(harness.currentState().is(AfterThing)).toBeTruthy()
    expect(harness.currentState().data.count).toBe(INITIAL_COUNT + RETURN_COUNT)
  })
})
