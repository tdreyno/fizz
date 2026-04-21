/**
 * @jest-environment jsdom
 */

import { describe, expect, jest, test } from "@jest/globals"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { createElement } from "react"

import { createMachineContext } from "../createMachineContext"
import { useMachine } from "../useMachine"
import { useMachineSubscription } from "../useMachineSubscription"
import { Machine, States } from "./machine"

describe("useMachineSubscription", () => {
  test("does not emit current state by default", async () => {
    const listener = jest.fn<(name: string) => void>()

    const { result } = renderHook(() => {
      const machine = useMachine(
        Machine,
        Machine.states.Initializing({ didWorld: false }),
      )

      useMachineSubscription(machine, state => {
        listener(state.name)
      })

      return machine
    })

    expect(listener).toHaveBeenCalledTimes(0)

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith("Ready")
    })
  })

  test("can emit current state immediately when enabled", async () => {
    const listener = jest.fn<(name: string) => void>()

    const { result } = renderHook(() => {
      const machine = useMachine(
        Machine,
        Machine.states.Initializing({ didWorld: false }),
      )

      useMachineSubscription(
        machine,
        state => {
          listener(state.name)
        },
        { emitCurrent: true },
      )

      return machine
    })

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith("Initializing")
    })

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith("Ready")
    })
  })

  test("works with createMachineContext and cleans up on unmount", async () => {
    const listener = jest.fn<(name: string) => void>()
    const { Provider, useMachineContext } = createMachineContext(Machine)
    let world:
      | undefined
      | (() => {
          asPromise: () => Promise<void>
        })

    const wrapper = ({ children }: { children?: ReactNode }) =>
      createElement(
        Provider,
        {
          initialState: States.Initializing({ didWorld: false }),
        },
        children,
      )

    const { unmount } = renderHook(
      () => {
        const machine = useMachineContext()

        world = machine.actions.world

        useMachineSubscription(
          machine,
          state => {
            listener(state.name)
          },
          { emitCurrent: true },
        )

        return machine
      },
      { wrapper },
    )

    await waitFor(() => {
      expect(listener).toHaveBeenCalledWith("Initializing")
    })

    const callCountBeforeUnmount = listener.mock.calls.length

    unmount()

    if (!world) {
      throw new Error("Expected world action")
    }

    const dispatchWorld = world

    await act(async () => {
      await dispatchWorld().asPromise()
    })

    expect(listener).toHaveBeenCalledTimes(callCountBeforeUnmount)
  })

  test("uses latest listener without resubscribing", async () => {
    const firstListener = jest.fn<(name: string) => void>()
    const secondListener = jest.fn<(name: string) => void>()

    const { result, rerender } = renderHook(
      ({ listener }) => {
        const machine = useMachine(
          Machine,
          Machine.states.Initializing({ didWorld: false }),
        )

        useMachineSubscription(machine, state => {
          listener(state.name)
        })

        return machine
      },
      {
        initialProps: {
          listener: firstListener,
        },
      },
    )

    rerender({ listener: secondListener })

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    await waitFor(() => {
      expect(secondListener).toHaveBeenCalledWith("Ready")
    })

    expect(firstListener).toHaveBeenCalledTimes(0)
  })
})
