import { createAction, enter, type Enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { createRuntime } from "../runtime"
import { isState, state, waitState } from "../state"
import { timeout } from "./util"

const INITIAL_COUNT = 5
const RETURN_COUNT = 10

const fetchThing = createAction<"FetchThing", number>("FetchThing")

const thingFetched = createAction<"ThingFetched", number>("ThingFetched")

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
    const BeforeThing = state<Enter, D>(
      {
        Enter: data => WaitForThing([data, RETURN_COUNT]),
      },
      { name: "BeforeThing" },
    )

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
    const context = createInitialContext([
      BeforeThing({
        count: INITIAL_COUNT,
      }),
    ])

    const runtime = createRuntime(context, {}, { fetchThing })

    runtime.onOutput(action => {
      if (action.type === "FetchThing") {
        setTimeout(() => {
          void runtime.run(thingFetched(action.payload))
        }, 250)
      }
    })

    expect(isState(runtime.currentState(), BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(isState(runtime.currentState(), WaitForThing)).toBeTruthy()

    await timeout(500)

    expect(isState(runtime.currentState(), AfterThing)).toBeTruthy()
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

    const runtime = createRuntime(context, {}, { fetchThing })

    expect(isState(runtime.currentState(), BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(isState(runtime.currentState(), WaitForThing)).toBeTruthy()

    await timeout(2000)

    expect(isState(runtime.currentState(), TimedOutState)).toBeTruthy()
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

    const runtime = createRuntime(context, {}, { fetchThing })

    expect(isState(runtime.currentState(), BeforeThing)).toBeTruthy()

    await runtime.run(enter())

    expect(isState(runtime.currentState(), WaitForThing)).toBeTruthy()

    await timeout(2000)

    expect(isState(runtime.currentState(), TimedOutState)).toBeTruthy()
    expect((runtime.currentState().data as D).count).toBe(INITIAL_COUNT)
  })
})
