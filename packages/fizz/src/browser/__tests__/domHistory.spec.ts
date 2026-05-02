import "../index"

import { describe, expect, jest, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../../action"
import { action, enter } from "../../action"
import { createInitialContext } from "../../context"
import {
  historyPushState,
  historyReplaceState,
  historySetScrollRestoration,
  noop,
} from "../../effect"
import { Runtime } from "../../runtime"
import { state } from "../../state"
import { dom } from "../domEffects"
import { createMockDomDriver } from "./domTestUtils"

const timeout = (ms: number) =>
  new Promise<void>(resolve => setTimeout(resolve, ms))

describe("DOM history", () => {
  test("should dispatch mapped actions from history.listen('popstate') and clean up on state exit", async () => {
    const didPopState = action("DidPopState").withPayload<PopStateEvent>()
    const finish = action("Finish")

    type DidPopState = ActionCreatorType<typeof didPopState>
    type Finish = ActionCreatorType<typeof finish>

    const Done = state<Enter, { count: number }>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Listening = state<Enter | DidPopState | Finish, { count: number }>(
      {
        DidPopState: (data, _, { update }) => update({ count: data.count + 1 }),
        Enter: () => dom.history().listen("popstate", didPopState),
        Finish: data => Done(data),
      },
      { name: "Listening" },
    )

    const mock = createMockDomDriver()
    const runtime = new Runtime(
      createInitialContext([Listening({ count: 0 })]),
      { didPopState, finish },
      {},
      { browserDriver: mock.driver },
    )

    await runtime.run(enter())

    expect(mock.emit.history.listenerCount("popstate")).toBe(1)

    const popped = new Promise<void>(resolve => {
      const unsubscribe = runtime.onContextChange(context => {
        const currentState = context.currentState

        if (currentState.is(Listening) && currentState.data.count === 1) {
          unsubscribe()
          resolve()
        }
      })
    })

    mock.emit.history.emit("popstate", new Event("popstate"))
    await popped

    const current = runtime.currentState()

    expect(current.name).toBe("Listening")
    expect((current.data as { count: number }).count).toBe(1)

    await runtime.run(finish())

    expect(mock.emit.history.listenerCount("popstate")).toBe(0)
  })

  test("should call driver historyPushState with state and url", async () => {
    const pushStateFn = jest.fn<(state: unknown, url?: string) => void>()

    const Navigating = state<Enter>(
      {
        Enter: () => historyPushState({ page: 1 }, "/page/1"),
      },
      { name: "Navigating" },
    )

    const runtime = new Runtime(
      createInitialContext([Navigating()]),
      {},
      {},
      {
        browserDriver: {
          historyPushState: pushStateFn,
        },
      },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(pushStateFn).toHaveBeenCalledTimes(1)
    expect(pushStateFn).toHaveBeenCalledWith({ page: 1 }, "/page/1")
  })

  test("should call driver historyPushState with state only when url omitted", async () => {
    const pushStateFn = jest.fn<(state: unknown, url?: string) => void>()

    const Navigating = state<Enter>(
      {
        Enter: () => historyPushState({ page: 2 }),
      },
      { name: "Navigating" },
    )

    const runtime = new Runtime(
      createInitialContext([Navigating()]),
      {},
      {},
      {
        browserDriver: {
          historyPushState: pushStateFn,
        },
      },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(pushStateFn).toHaveBeenCalledTimes(1)
    expect(pushStateFn).toHaveBeenCalledWith({ page: 2 }, undefined)
  })

  test("should call driver historyReplaceState with state and url", async () => {
    const replaceStateFn = jest.fn<(state: unknown, url?: string) => void>()

    const Navigating = state<Enter>(
      {
        Enter: () => historyReplaceState({ replace: true }, "/replaced"),
      },
      { name: "Navigating" },
    )

    const runtime = new Runtime(
      createInitialContext([Navigating()]),
      {},
      {},
      {
        browserDriver: {
          historyReplaceState: replaceStateFn,
        },
      },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(replaceStateFn).toHaveBeenCalledTimes(1)
    expect(replaceStateFn).toHaveBeenCalledWith({ replace: true }, "/replaced")
  })

  test("should call driver historySetScrollRestoration with value", async () => {
    const setScrollRestorationFn = jest.fn<(value: ScrollRestoration) => void>()

    const Navigating = state<Enter>(
      {
        Enter: () => historySetScrollRestoration("manual"),
      },
      { name: "Navigating" },
    )

    const runtime = new Runtime(
      createInitialContext([Navigating()]),
      {},
      {},
      {
        browserDriver: {
          historySetScrollRestoration: setScrollRestorationFn,
        },
      },
    )

    await runtime.run(enter())
    await timeout(0)

    expect(setScrollRestorationFn).toHaveBeenCalledTimes(1)
    expect(setScrollRestorationFn).toHaveBeenCalledWith("manual")
  })
})
