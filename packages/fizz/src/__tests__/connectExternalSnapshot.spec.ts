import { jest } from "@jest/globals"

import { action, enter } from "../action"
import { connectExternalSnapshot } from "../connectExternalSnapshot"
import { createInitialContext } from "../context"
import { Runtime } from "../runtime"
import { state } from "../state"

type StoreState = { count: number; name: string }

function createStore(initial: StoreState) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => current,
    setState: (next: StoreState) => {
      current = next
      listeners.forEach(l => l())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const CountChanged = action("CountChanged").withPayload<number>()
const NameChanged = action("NameChanged").withPayload<string>()

describe("connectExternalSnapshot", () => {
  function makeRuntime() {
    const A = state<ReturnType<typeof enter>>(
      { Enter: () => undefined },
      { name: "A" },
    )
    const context = createInitialContext([A()])
    return new Runtime(
      context,
      { countChanged: CountChanged, nameChanged: NameChanged },
      {},
    )
  }

  test("dispatches action on first store change", async () => {
    const store = createStore({ count: 0, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
    })

    store.setState({ count: 1, name: "a" })
    await Promise.resolve()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(CountChanged(1))
  })

  test("suppresses duplicate dispatch when equality returns true", async () => {
    const store = createStore({ count: 0, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
    })

    store.setState({ count: 0, name: "b" })
    await Promise.resolve()

    expect(fn).not.toHaveBeenCalled()
  })

  test("uses custom equality function", async () => {
    const store = createStore({ count: 0, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s,
      toAction: s => CountChanged(s.count),
      equality: (a, b) => a.count === b.count,
    })

    // name changes but count stays the same — should be suppressed
    store.setState({ count: 0, name: "changed" })
    await Promise.resolve()

    expect(fn).not.toHaveBeenCalled()

    // count changes — should dispatch
    store.setState({ count: 5, name: "changed" })
    await Promise.resolve()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(CountChanged(5))
  })

  test("emitInitial true dispatches immediately on init", async () => {
    const store = createStore({ count: 7, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
      emitInitial: true,
    })

    await Promise.resolve()

    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(CountChanged(7))
  })

  test("emitInitial false does not dispatch on init but primes dedup state", async () => {
    const store = createStore({ count: 7, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
      emitInitial: false,
    })

    await Promise.resolve()
    expect(fn).not.toHaveBeenCalled()

    // same value as initial — still suppressed
    store.setState({ count: 7, name: "b" })
    await Promise.resolve()
    expect(fn).not.toHaveBeenCalled()

    // new value — dispatches
    store.setState({ count: 8, name: "b" })
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith(CountChanged(8))
  })

  test("loop guard suppresses when key matches last dispatched key", async () => {
    const store = createStore({ count: 1, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
      loopGuard: { key: n => String(n) },
    })

    // change to count=2, key="2" — dispatches and records key
    store.setState({ count: 2, name: "a" })
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(1)

    // same count=2 again (e.g. machine wrote back), key="2" — suppressed
    store.setState({ count: 2, name: "b" })
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test("loop guard allows dispatch when key changes", async () => {
    const store = createStore({ count: 1, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
      loopGuard: { key: n => String(n) },
    })

    store.setState({ count: 2, name: "a" })
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(1)

    // new count=3, key="3" — different from last key="2", dispatches
    store.setState({ count: 3, name: "a" })
    await Promise.resolve()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenLastCalledWith(CountChanged(3))
  })

  test("returned disconnect stops all future dispatches", async () => {
    const store = createStore({ count: 0, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    const disconnect = connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
    })

    disconnect()

    store.setState({ count: 1, name: "a" })
    await Promise.resolve()

    expect(fn).not.toHaveBeenCalled()
  })

  test("runtime.disconnect auto-unsubscribes from the store", async () => {
    const store = createStore({ count: 0, name: "a" })
    const runtime = makeRuntime()
    const fn = jest.spyOn(runtime, "run")

    connectExternalSnapshot({
      runtime,
      subscribe: store.subscribe,
      read: store.getState,
      select: s => s.count,
      toAction: CountChanged,
    })

    runtime.disconnect()

    store.setState({ count: 1, name: "a" })
    await Promise.resolve()

    expect(fn).not.toHaveBeenCalled()
  })
})
