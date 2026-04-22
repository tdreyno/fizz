import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { action } from "../action"
import { noop, output } from "../effect"
import { state } from "../state"
import { createTestHarness, deferred } from "../test"

type Data = {
  events: string[]
  profileName?: string
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const ignoreAsync = () => undefined

describe("Test harness", () => {
  test("should expose respondToOutput as a harness shortcut", async () => {
    const acknowledge = action("Acknowledge")
    type Acknowledge = ActionCreatorType<typeof acknowledge>

    const notice = action("Notice").withPayload<string>()

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter | Acknowledge, Data>(
      {
        Enter: (data, _, { update }) => [
          update(appendEvent(data, "enter")),
          output(notice("entered")),
        ],

        Acknowledge: data => Done(appendEvent(data, "acknowledged")),
      },
      { name: "Editing" },
    )

    const harness = createTestHarness({
      history: [Editing({ events: [] })],
      internalActions: { acknowledge },
      outputActions: { notice },
    })

    const reachedDone = new Promise<void>(resolve => {
      const unsubscribe = harness.runtime.onContextChange(context => {
        if (context.currentState.is(Done)) {
          unsubscribe()
          resolve()
        }
      })
    })

    harness.respondToOutput("Notice", payload => {
      const typedPayload: string = payload

      expect(payload).toBe("entered")
      expect(typedPayload).toBe("entered")

      return acknowledge()
    })

    await harness.start()
    await reachedDone

    const currentState = harness.currentState()

    expect(currentState.is(Done)).toBeTruthy()

    if (!currentState.is(Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.events).toEqual(["enter", "acknowledged"])
  })

  test("should record states and outputs while starting and running actions", async () => {
    const save = action("Save")
    type Save = ActionCreatorType<typeof save>

    const notice = action("Notice").withPayload<string>()

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter | Save, Data>(
      {
        Enter: (data, _, { update }) => [
          update(appendEvent(data, "enter")),
          output(notice("entered")),
        ],

        Save: data => Done(appendEvent(data, "save")),
      },
      { name: "Editing" },
    )

    const harness = createTestHarness({
      history: [Editing({ events: [] })],
      internalActions: { save },
      outputActions: { notice },
    })
    const typedOutputs: Array<ReturnType<typeof notice>> = harness.outputs()
    const typedLastOutput: ReturnType<typeof notice> | undefined =
      harness.lastOutput()
    const typedSave: ReturnType<typeof save> = save()

    expect(harness.currentState().is(Editing)).toBeTruthy()
    expect(typedOutputs).toEqual([])
    expect(typedLastOutput).toBeUndefined()
    expect(
      harness.states().map(({ currentState }) => currentState.name),
    ).toEqual(["Editing"])

    await harness.start()
    await harness.run(typedSave)

    expect(harness.currentState().is(Done)).toBeTruthy()
    expect(harness.outputs()).toEqual([notice("entered")])
    expect(harness.lastOutput()).toEqual(notice("entered"))
    expect(
      harness.states().map(({ currentState }) => currentState.name),
    ).toEqual(["Editing", "Editing", "Editing", "Done"])
    expect(harness.lastState()?.currentState.data.events).toEqual([
      "enter",
      "save",
    ])
  })

  test("should expose controlled async and timer helpers", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<string>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    type TimeoutId = "autosave"
    type AsyncId = "profile"

    const loadProfile = deferred<string>()

    const Loading = state<
      Enter | ProfileLoaded,
      Data,
      TimeoutId,
      string,
      AsyncId
    >(
      {
        Enter: (data, _, { startAsync, startTimer, update }) => [
          update(appendEvent(data, "enter")),
          startAsync(
            loadProfile.promise,
            {
              reject: ignoreAsync,
              resolve: profileLoaded,
            },
            "profile",
          ),
          startTimer("autosave", 10),
        ],

        ProfileLoaded: (data, profile, { update }) =>
          update({
            ...appendEvent(data, `loaded:${profile}`),
            profileName: profile,
          }),

        TimerCompleted: (data, { timeoutId }, { update }) =>
          update(appendEvent(data, `completed:${timeoutId}`)),
      },
      { name: "Loading" },
    )

    const harness = createTestHarness({
      history: [Loading({ events: [] })],
      internalActions: { profileLoaded },
    })

    await harness.start()

    loadProfile.resolve("Ada")

    await harness.settle()
    await harness.advanceBy(10)
    await harness.settle()

    const currentState = harness.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["enter", "loaded:Ada", "completed:autosave"],
      profileName: "Ada",
    })
  })

  test("should wait for output by type and predicate", async () => {
    const notice = action("Notice").withPayload<string>()

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter, Data>(
      {
        Enter: data => [
          output(notice("entered")),
          Done(appendEvent(data, "done")),
        ],
      },
      { name: "Editing" },
    )

    const harness = createTestHarness({
      history: [Editing({ events: [] })],
      outputActions: { notice },
    })

    await harness.start()

    const byType = await harness.waitForOutput("Notice")
    const byPredicate = await harness.waitForOutput(
      action => action.type === "Notice" && action.payload === "entered",
    )

    expect(byType).toEqual(notice("entered"))
    expect(byPredicate).toEqual(notice("entered"))
  })

  test("should fail when waitForState exceeds max iterations", async () => {
    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<Enter, Data>(
      {
        Enter: (data, _, { update }) => update(data),
      },
      { name: "Editing" },
    )

    const harness = createTestHarness({
      history: [Editing({ events: [] })],
    })

    await harness.start()

    await expect(
      harness.waitForState(state => state.is(Done), { maxIterations: 2 }),
    ).rejects.toThrow("State predicate did not match within 2 iterations.")
  })
})
