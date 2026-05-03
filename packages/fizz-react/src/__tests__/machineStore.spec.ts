/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test } from "@jest/globals"
import type { Enter } from "@tdreyno/fizz"
import { action, createMachine, noop, selectWhen, state } from "@tdreyno/fizz"
import { act, renderHook, waitFor } from "@testing-library/react"

import {
  subscribeIfEnabled,
  useMachineHandle,
  useMachineStore,
  useMachineValue,
} from "../machineStore"
import { Machine, States } from "./machine"

describe("machineStore", () => {
  test("subscribeIfEnabled returns noop subscription when disabled", () => {
    const subscribe = jest.fn(() => jest.fn())

    const disabledSubscribe = subscribeIfEnabled(false, subscribe)
    const unsubscribe = disabledSubscribe(() => void 0)

    expect(subscribe).not.toHaveBeenCalled()
    expect(typeof unsubscribe).toBe("function")
  })

  test("useMachineStore start is idempotent and exposes snapshots", async () => {
    const { result } = renderHook(() =>
      useMachineStore(Machine, States.Initializing({ didWorld: false })),
    )

    const listener = jest.fn()
    const unsubscribe = result.current.subscribe(listener)

    result.current.start()

    await act(async () => {
      await result.current.getSnapshot().actions.world().asPromise()
    })

    await waitFor(() => {
      expect(listener).toHaveBeenCalled()
      expect(result.current.getSnapshot().currentState.name).toBe("Ready")
    })

    unsubscribe()
  })

  test("useMachineValue supports omitted options argument", async () => {
    const { result } = renderHook(() =>
      useMachineValue(Machine, States.Initializing({ didWorld: false })),
    )

    expect(result.current.currentState.name).toBe("Initializing")

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    await waitFor(() => {
      expect(result.current.currentState.name).toBe("Ready")
    })
  })

  test("useMachineHandle supports omitted options and exposes live getters", async () => {
    const { result } = renderHook(() =>
      useMachineHandle(Machine, States.Initializing({ didWorld: false })),
    )

    expect(result.current.currentState.name).toBe("Initializing")
    expect(result.current.context.currentState.name).toBe("Initializing")
    expect(result.current.selectors.isReady).toBeUndefined()

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    await waitFor(() => {
      expect(result.current.currentState.name).toBe("Ready")
      expect(result.current.context.currentState.name).toBe("Ready")
      expect(result.current.selectors.isReady).toBe(true)
    })
  })

  test("selector binding ignores undefined selectors", async () => {
    const world = action("World")
    const Ready = state<Enter, { didWorld: boolean }>(
      {
        Enter: noop,
      },
      { name: "Ready" },
    )
    const Initializing = state<
      Enter | ReturnType<typeof world>,
      { didWorld: boolean }
    >(
      {
        Enter: noop,
        World: () => Ready({ didWorld: true }),
      },
      { name: "Initializing" },
    )

    const machineWithSparseSelectors = createMachine({
      actions: { world },
      selectors: {
        isReady: selectWhen(Ready, () => true),
        missing: undefined,
      } as never,
      states: { Initializing, Ready },
    })

    const { result } = renderHook(() =>
      useMachineValue(
        machineWithSparseSelectors,
        Initializing({ didWorld: false }),
      ),
    )

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    await waitFor(() => {
      expect(result.current.selectors.isReady).toBe(true)
    })
  })
})
