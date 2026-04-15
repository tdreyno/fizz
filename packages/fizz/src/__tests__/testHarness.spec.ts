import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { action } from "../action"
import { noop, output } from "../effect"
import { isState, state } from "../state"
import { createTestHarness, deferred } from "../test"

type Data = {
  events: string[]
  profileName?: string
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

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
        if (isState(context.currentState, Done)) {
          unsubscribe()
          resolve()
        }
      })
    })

    harness.respondToOutput("Notice", payload => {
      expect(payload).toBe("entered")

      return acknowledge()
    })

    await harness.start()
    await reachedDone

    const currentState = harness.currentState()

    expect(isState(currentState, Done)).toBeTruthy()

    if (!isState(currentState, Done)) {
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

    expect(isState(harness.currentState(), Editing)).toBeTruthy()
    expect(
      harness.states().map(({ currentState }) => currentState.name),
    ).toEqual(["Editing"])

    await harness.start()
    await harness.run(save())

    expect(isState(harness.currentState(), Done)).toBeTruthy()
    expect(harness.outputs()).toEqual([notice("entered")])
    expect(harness.lastOutput()).toEqual(notice("entered"))
    expect(
      harness.states().map(({ currentState }) => currentState.name),
    ).toEqual(["Editing", "Editing", "Editing", "Editing", "Done"])
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
            { resolve: profileLoaded },
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

    await harness.flushAsync()
    await harness.advanceBy(10)

    const currentState = harness.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["enter", "loaded:Ada", "completed:autosave"],
      profileName: "Ada",
    })
  })
})
