import { jest } from "@jest/globals"

import type { Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { noop, output } from "../effect"
import {
  matchOutput,
  matchState,
  RuntimeDisconnectedError,
  WaitUntilAbortError,
  WaitUntilTimeoutError,
} from "../index"
import { Runtime } from "../runtime"
import { state } from "../state"

const next = action("Next")
type Next = ReturnType<typeof next>

describe("waitUntil", () => {
  describe("matchState", () => {
    test("resolves when transitioning into the matching state", async () => {
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })

      const A = state<Enter | Next>(
        {
          Enter: () => noop(),
          Next: () => B(),
        },
        { name: "A" },
      )

      const context = createInitialContext([A()])
      const runtime = new Runtime(context, { next })

      const promise = runtime.waitUntilState(B)
      await runtime.run(next())
      const resolved = await promise

      expect(resolved.is(B)).toBe(true)
    })

    test("resolves immediately via microtask when includeCurrent matches", async () => {
      const A = state<Enter>({ Enter: () => noop() }, { name: "A" })
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {})

      let resolvedSync = true
      const promise = runtime.waitUntilState(A).then(value => {
        return value
      })
      // synchronous code after the call should run before the promise resolves
      resolvedSync = false

      const resolved = await promise
      expect(resolvedSync).toBe(false)
      expect(resolved.is(A)).toBe(true)
    })

    test("ignores current state when includeCurrent is false", async () => {
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const A = state<Enter | Next>(
        {
          Enter: () => noop(),
          Next: () => B(),
        },
        { name: "A" },
      )

      const context = createInitialContext([A()])
      const runtime = new Runtime(context, { next })

      const promise = runtime.waitUntilState(A, { includeCurrent: false })
      const settled = jest.fn()
      void promise.then(settled, settled)

      await Promise.resolve()
      await Promise.resolve()

      expect(settled).not.toHaveBeenCalled()

      await runtime.run(next())
      // back-transition not modeled here; abort to clean up
    })

    test("matchState honors `where` predicate", async () => {
      const Loaded = state<Enter, { ready: boolean }>(
        { Enter: () => noop() },
        { name: "Loaded" },
      )
      const Loading = state<Enter | Next, { ready: boolean }>(
        {
          Enter: () => noop(),
          Next: data => Loaded({ ready: data.ready }),
        },
        { name: "Loading" },
      )

      const context = createInitialContext([Loading({ ready: true })])
      const runtime = new Runtime(context, { next })

      const promise = runtime.waitUntilState(
        matchState(Loaded, { where: data => data.ready }),
      )
      await runtime.run(next())
      const resolved = await promise

      expect(resolved.data).toEqual({ ready: true })
    })
  })

  describe("matchOutput", () => {
    test("resolves on action constructor match", async () => {
      const saved = action("Saved").withPayload<{ id: string }>()
      const savedAction = saved({ id: "1" })

      const A = state<Enter>(
        { Enter: () => output(savedAction) },
        { name: "A" },
      )
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {}, { saved })

      const promise = runtime.waitUntilOutput(saved)
      await runtime.run(enter())
      const resolved = await promise

      expect(resolved).toBe(savedAction)
    })

    test("resolves on object handler map and ignores undefined results", async () => {
      const closed = action("Closed")
      const blocked = action("Blocked")
      const blockedAction = blocked()

      const A = state<Enter>(
        { Enter: () => output(blockedAction) },
        { name: "A" },
      )
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {}, { blocked, closed })

      const result = await runtime.runUntil(
        enter(),
        matchOutput({
          Closed: () => true,
          Blocked: () => false,
        }),
      )

      expect(result).toBe(false)
    })

    test("resolves with 0/null/false from mapper, ignores undefined", async () => {
      const evt = action("Evt").withPayload<number>()

      const A = state<Enter>(
        { Enter: () => [output(evt(0)), output(evt(1))] },
        { name: "A" },
      )
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {}, { evt })

      const result = await runtime.runUntil(
        enter(),
        matchOutput({
          Evt: (a: ReturnType<typeof evt>) =>
            a.payload === 0 ? null : undefined,
        }),
      )

      expect(result).toBeNull()
    })
  })

  describe("cancellation", () => {
    test("AbortSignal rejects with WaitUntilAbortError", async () => {
      const A = state<Enter>({ Enter: () => noop() }, { name: "A" })
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {})

      const controller = new AbortController()
      const promise = runtime.waitUntilState(B, { signal: controller.signal })
      controller.abort()

      await expect(promise).rejects.toBeInstanceOf(WaitUntilAbortError)
    })

    test("timeout rejects with WaitUntilTimeoutError", async () => {
      const A = state<Enter>({ Enter: () => noop() }, { name: "A" })
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {})

      await expect(
        runtime.waitUntilState(B, { timeout: 10 }),
      ).rejects.toBeInstanceOf(WaitUntilTimeoutError)
    })

    test("disconnect rejects pending with RuntimeDisconnectedError", async () => {
      const A = state<Enter>({ Enter: () => noop() }, { name: "A" })
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {})

      const promise = runtime.waitUntilState(B)
      runtime.disconnect()

      await expect(promise).rejects.toBeInstanceOf(RuntimeDisconnectedError)
    })
  })

  describe("runUntil", () => {
    test("subscribes before dispatch (catches synchronous transitions)", async () => {
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const A = state<Enter | Next>(
        {
          Enter: () => noop(),
          Next: () => B(),
        },
        { name: "A" },
      )

      const context = createInitialContext([A()])
      const runtime = new Runtime(context, { next })

      const resolved = await runtime.runUntil(next(), matchState(B))
      expect(resolved.is(B)).toBe(true)
    })

    test("concurrent waitUntil calls are independent", async () => {
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const A = state<Enter | Next>(
        {
          Enter: () => noop(),
          Next: () => B(),
        },
        { name: "A" },
      )

      const context = createInitialContext([A()])
      const runtime = new Runtime(context, { next })

      const p1 = runtime.waitUntilState(B)
      const p2 = runtime.waitUntilState(B)
      await runtime.run(next())

      const [a, b] = await Promise.all([p1, p2])
      expect(a.is(B)).toBe(true)
      expect(b.is(B)).toBe(true)
    })
  })

  describe("monitor events", () => {
    test("emits register/resolve events on success", async () => {
      const A = state<Enter>({ Enter: () => noop() }, { name: "A" })
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {})

      const events: string[] = []
      runtime.addMonitor(event => {
        if (event.type.startsWith("wait-until-")) {
          events.push(event.type)
        }
      })

      await runtime.waitUntilState(A)
      expect(events).toEqual(["wait-until-registered", "wait-until-resolved"])
    })

    test("emits register/reject events on timeout", async () => {
      const A = state<Enter>({ Enter: () => noop() }, { name: "A" })
      const B = state<Enter>({ Enter: () => noop() }, { name: "B" })
      const context = createInitialContext([A()])
      const runtime = new Runtime(context, {})

      const events: Array<{ type: string; reason?: string }> = []
      runtime.addMonitor(event => {
        if (event.type === "wait-until-rejected") {
          events.push({ type: event.type, reason: event.reason })
        } else if (event.type === "wait-until-registered") {
          events.push({ type: event.type })
        }
      })

      await runtime.waitUntilState(B, { timeout: 5 }).catch(() => undefined)

      expect(events).toEqual([
        { type: "wait-until-registered" },
        { type: "wait-until-rejected", reason: "timeout" },
      ])
    })
  })
})
