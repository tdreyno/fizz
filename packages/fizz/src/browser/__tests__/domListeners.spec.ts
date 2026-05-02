import "../index"

import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../../action"
import { action, enter } from "../../action"
import { createInitialContext } from "../../context"
import { noop } from "../../effect"
import { Runtime } from "../../runtime"
import { state } from "../../state"
import { listStateResourceKeys } from "../../stateResources"
import { dom } from "../domEffects"
import { createMockDomDriver } from "./domTestUtils"

describe("DOM listeners", () => {
  test("should dispatch mapped actions from listen() and clean listener on state exit", async () => {
    const didClick = action("DidClick").withPayload<Event>()
    const finish = action("Finish")

    type DidClick = ActionCreatorType<typeof didClick>
    type Finish = ActionCreatorType<typeof finish>

    const Done = state<Enter, { clicks: number }>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Listening = state<Enter | DidClick | Finish, { clicks: number }>(
      {
        DidClick: (data, _, { update }) =>
          update({
            clicks: data.clicks + 1,
          }),
        Enter: () => dom.window().onClick(didClick),
        Finish: data => Done(data),
      },
      { name: "Listening" },
    )

    const mock = createMockDomDriver()
    const runtime = new Runtime(
      createInitialContext([Listening({ clicks: 0 })]),
      { didClick, finish },
      {},
      { browserDriver: mock.driver },
    )

    await runtime.run(enter())

    expect(mock.emit.window.listenerCount("click")).toBe(1)
    const clicked = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (currentState.is(Listening) && currentState.data.clicks === 1) {
          unsubscribe()
          resolve()
        }
      })
    })

    mock.emit.window.emit("click", new Event("click"))
    await clicked

    const current = runtime.currentState()

    expect(current.name).toBe("Listening")
    expect((current.data as { clicks: number }).clicks).toBe(1)

    await runtime.run(finish())

    expect(mock.emit.window.listenerCount("click")).toBe(0)
  })

  test("should store observer resource IDs and disconnect IntersectionObserver on cleanup", async () => {
    const intersected = action("Intersected").withPayload<number>()
    const finish = action("Finish")

    type Intersected = ActionCreatorType<typeof intersected>
    type Finish = ActionCreatorType<typeof finish>

    const Done = state<Enter, { hits: number }>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Observing = state<Enter | Finish | Intersected, { hits: number }>(
      {
        Enter: () =>
          dom
            .body("viewport")
            .observeIntersection("observer-1", entries =>
              intersected(entries.length),
            ),
        Finish: data => Done(data),
        Intersected: (data, count, { update }) =>
          update({
            hits: data.hits + count,
          }),
      },
      { name: "Observing" },
    )

    const mock = createMockDomDriver()
    const runtime = new Runtime(
      createInitialContext([Observing({ hits: 0 })]),
      { finish, intersected },
      {},
      { browserDriver: mock.driver },
    )

    await runtime.run(enter())

    expect(listStateResourceKeys(runtime.currentState())).toContain(
      "observer-1",
    )
    expect(mock.intersectionObservers).toHaveLength(1)

    const observerRecord = mock.intersectionObservers[0]

    if (!observerRecord) {
      throw new Error("Expected an IntersectionObserver instance")
    }

    const intersectedOnce = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (currentState.is(Observing) && currentState.data.hits === 1) {
          unsubscribe()
          resolve()
        }
      })
    })

    observerRecord.callback(
      [{} as IntersectionObserverEntry],
      observerRecord.observer,
    )
    await intersectedOnce

    const current = runtime.currentState()

    expect(current.name).toBe("Observing")
    expect((current.data as { hits: number }).hits).toBe(1)

    await runtime.run(finish())

    expect(observerRecord.disconnectCalls).toBe(1)
  })
})
