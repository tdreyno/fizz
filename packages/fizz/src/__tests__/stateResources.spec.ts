import { describe, expect, test } from "@jest/globals"

import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { abortController, noop, resource, subscription } from "../effect"
import { createControlledTimerDriver, Runtime } from "../runtime"
import { state } from "../state"
import { createTestHarness } from "../test"

const createEventResource = <Event>() => {
  const listeners = new Set<(event: Event) => void>()

  return {
    emit: (event: Event) => {
      listeners.forEach(listener => {
        listener(event)
      })
    },
    subscribe: (onEvent: (event: Event) => void) => {
      listeners.add(onEvent)

      return () => {
        listeners.delete(onEvent)
      }
    },
  }
}

describe("state resources", () => {
  test("should expose resources in handler utils with state-scoped lifecycle", async () => {
    const useResources = action("UseResources")
    type UseResources = ActionCreatorType<typeof useResources>

    const Done = state<Enter, { logs: string[] }>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Editing = state<UseResources | Enter, { logs: string[] }>(
      {
        Enter: data => [
          resource("sessionId", "abc-123"),
          abortController("ac"),
          subscription("unsubscribePresence", () => () => {
            data.logs.push("unsubscribe")
          }),
        ],
        UseResources: (data, _, { resources }) => {
          const controller = resources.ac as AbortController
          const sessionId = resources.sessionId as string

          controller.abort()
          ;(resources.unsubscribePresence as () => void)()

          return Done({
            logs: [...data.logs, `session:${sessionId}`],
          })
        },
      },
      { name: "Editing" },
    )

    const runtime = new Runtime(createInitialContext([Editing({ logs: [] })]), {
      useResources,
    })

    await runtime.run(enter())
    await runtime.run(useResources())

    const doneState = runtime.currentState()

    expect(doneState.is(Done)).toBeTruthy()

    if (!doneState.is(Done)) {
      throw new Error("Expected Done state")
    }

    expect(doneState.data.logs).toContain("session:abc-123")
    expect(doneState.data.logs).toContain("unsubscribe")
  })

  test("should preserve resources across same-state updates", async () => {
    const increment = action("Increment")
    type Increment = ActionCreatorType<typeof increment>

    type Data = {
      count: number
      seen: string[]
    }

    type Resources = {
      sessionId: string
    }

    const Counting = state<
      Increment | Enter,
      Data,
      string,
      string,
      string,
      Resources
    >(
      {
        Enter: () => resource("sessionId", "stable"),
        Increment: (data, _, { resources, update }) =>
          update({
            count: data.count + 1,
            seen: [...data.seen, resources.sessionId],
          }),
      },
      { name: "Counting" },
    )

    const runtime = new Runtime(
      createInitialContext([Counting({ count: 0, seen: [] })]),
      {
        increment,
      },
    )

    await runtime.run(enter())
    await runtime.run(increment())
    await runtime.run(increment())

    const current = runtime.currentState()

    expect(current.is(Counting)).toBeTruthy()

    if (!current.is(Counting)) {
      throw new Error("Expected Counting state")
    }

    expect(current.data.count).toBe(2)
    expect(current.data.seen).toEqual(["stable", "stable"])
  })

  test("should emit monitor events for resource lifecycle", async () => {
    const next = action("Next")
    type Next = ActionCreatorType<typeof next>

    const events: string[] = []

    const Done = state<Enter, undefined>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Start = state<Enter | Next, undefined>(
      {
        Enter: () => [
          resource("sessionId", "abc"),
          resource("disposable", { id: 1 }, () => {
            events.push("disposed")
          }),
        ],
        Next: () => Done(),
      },
      { name: "Start" },
    )

    const monitorEvents: string[] = []

    const runtime = new Runtime(
      createInitialContext([Start()]),
      { next },
      {},
      {
        monitor: event => {
          if (
            event.type === "resource-registered" ||
            event.type === "resource-released" ||
            event.type === "resource-release-failed"
          ) {
            monitorEvents.push(event.type)
          }
        },
      },
    )

    await runtime.run(enter())
    await runtime.run(next())

    expect(monitorEvents).toContain("resource-registered")
    expect(monitorEvents).toContain("resource-released")
    expect(events).toEqual(["disposed"])
  })

  test("test harness should expose resource helpers", async () => {
    const done = action("Done")
    type Done = ActionCreatorType<typeof done>

    const Finished = state<Enter, undefined>(
      {
        Enter: noop,
      },
      { name: "Finished" },
    )

    const Running = state<Enter | Done, undefined>(
      {
        Enter: () => resource("sessionId", "abc"),
        Done: () => Finished(),
      },
      { name: "Running" },
    )

    const harness = createTestHarness({
      history: [Running()],
      internalActions: { done },
    })

    await harness.start()
    await harness.waitForResource("sessionId")

    expect(harness.resources().keys).toContain("sessionId")

    await harness.run(done())
    await harness.waitForResourceRelease("sessionId")

    expect(harness.resources().keys).toEqual([])
  })

  test("should bridge subscribed resource events to actions with debounce pacing", async () => {
    const localChanged = action("LocalChanged").withPayload<string>()
    const done = action("Done")
    type Done = ActionCreatorType<typeof done>
    type LocalChanged = ActionCreatorType<typeof localChanged>

    const timerDriver = createControlledTimerDriver()
    const editor = createEventResource<string>()

    const Finished = state<Enter, { logs: string[] }>(
      {
        Enter: noop,
      },
      { name: "Finished" },
    )

    const Editing = state<Enter | Done | LocalChanged, { logs: string[] }>(
      {
        Done: data => Finished({ logs: data.logs }),
        Enter: () =>
          resource("editor", editor)
            .bridge({ pace: { debounceMs: 10 } })
            .chainToAction(text => localChanged(String(text))),
        LocalChanged: (data, payload, { update }) =>
          update({
            ...data,
            logs: [...data.logs, payload],
          }),
      },
      { name: "Editing" },
    )

    const runtime = new Runtime(
      createInitialContext([Editing({ logs: [] })]),
      {
        done,
        localChanged,
      },
      {},
      { timerDriver },
    )

    await runtime.run(enter())

    editor.emit("a")
    editor.emit("ab")

    await timerDriver.advanceBy(9)

    const stillEditing = runtime.currentState()

    expect(stillEditing.is(Editing)).toBeTruthy()

    if (!stillEditing.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(stillEditing.data.logs).toEqual([])

    editor.emit("abc")
    await timerDriver.advanceBy(10)

    const afterDebounce = runtime.currentState()

    expect(afterDebounce.is(Editing)).toBeTruthy()

    if (!afterDebounce.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(afterDebounce.data.logs).toEqual(["abc"])

    await runtime.run(done())

    editor.emit("post-exit")
    await timerDriver.runAll()

    const finished = runtime.currentState()

    expect(finished.is(Finished)).toBeTruthy()

    if (!finished.is(Finished)) {
      throw new Error("Expected Finished state")
    }

    expect(finished.data.logs).toEqual(["abc"])
  })

  test("should bridge with latest pacing", async () => {
    const localChanged = action("LocalChanged").withPayload<string>()
    type LocalChanged = ActionCreatorType<typeof localChanged>
    const editor = createEventResource<string>()
    const timerDriver = createControlledTimerDriver()

    const Editing = state<Enter | LocalChanged, { logs: string[] }>(
      {
        Enter: () =>
          resource("editor", editor)
            .bridge({ pace: "latest" })
            .chainToAction(text => localChanged(String(text))),
        LocalChanged: (data, payload, { update }) =>
          update({
            ...data,
            logs: [...data.logs, payload],
          }),
      },
      { name: "Editing" },
    )

    const runtime = new Runtime(
      createInitialContext([Editing({ logs: [] })]),
      {
        localChanged,
      },
      {},
      { timerDriver },
    )

    await runtime.run(enter())

    editor.emit("v1")
    editor.emit("v2")
    editor.emit("v3")

    await timerDriver.advanceBy(0)

    const current = runtime.currentState()

    expect(current.is(Editing)).toBeTruthy()

    if (!current.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(current.data.logs).toEqual(["v3"])
  })
})
