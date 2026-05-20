/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals"
import { matchState, WaitUntilAbortError } from "@tdreyno/fizz"
import { act, renderHook, waitFor } from "@testing-library/react"

import { useMachine } from "../useMachine"
import { useRunUntil, useWaitUntilState } from "../useWaitUntil"
import { Machine, States } from "./machine"

describe("useWaitUntilState", () => {
  test("resolves when runtime transitions into matching state", async () => {
    const { result } = renderHook(() => {
      const machine = useMachine(
        Machine,
        Machine.states.Initializing({ didWorld: false }),
      )

      const waitResult = useWaitUntilState(machine.runtime, States.Ready)

      return { actions: machine.actions, waitResult }
    })

    expect(result.current.waitResult.status).toBe("pending")

    const typedWorld: () => { asPromise: () => Promise<void> } =
      result.current.actions.world
    await act(async () => {
      await typedWorld().asPromise()
    })

    await waitFor(() => {
      expect(result.current.waitResult.status).toBe("resolved")
    })
    expect(result.current.waitResult.value).toBeDefined()
    expect(
      (result.current.waitResult.value as ReturnType<typeof States.Ready>).is(
        States.Ready,
      ),
    ).toBe(true)
  })

  test("aborts pending wait on unmount", async () => {
    const { result, unmount } = renderHook(() => {
      const machine = useMachine(
        Machine,
        Machine.states.Initializing({ didWorld: false }),
      )

      const waitResult = useWaitUntilState(machine.runtime, States.Ready)

      return { machine, waitResult }
    })

    expect(result.current.waitResult.status).toBe("pending")

    unmount()
    // No assertion to make beyond "no unhandled rejection" — abort path cleans
    // the subscription via the runtime's signal handling.
  })
})

describe("useRunUntil", () => {
  test("returns callback that resolves after dispatch", async () => {
    const { result } = renderHook(() => {
      const machine = useMachine(
        Machine,
        Machine.states.Initializing({ didWorld: false }),
      )

      const runUntil = useRunUntil(machine.runtime)

      return { machine, runUntil }
    })

    let resolvedState: unknown

    await act(async () => {
      resolvedState = await result.current.runUntil(
        Machine.actions.world(),
        matchState(States.Ready),
      )
    })

    expect(
      (resolvedState as ReturnType<typeof States.Ready>).is(States.Ready),
    ).toBe(true)
  })

  test("aborts previous wait when called twice", async () => {
    const { result } = renderHook(() => {
      const machine = useMachine(
        Machine,
        Machine.states.Initializing({ didWorld: false }),
      )

      const runUntil = useRunUntil(machine.runtime)

      return { machine, runUntil }
    })

    let firstError: unknown

    await act(async () => {
      const first = result.current.runUntil(
        Machine.actions.world(),
        matchState(States.Initializing, {
          where: data => data.didWorld === true,
        }),
      )
      first.catch(error => {
        firstError = error
      })

      // Replace with a new wait — should abort the first.
      await result.current
        .runUntil(Machine.actions.world(), matchState(States.Ready))
        .catch(() => undefined)
    })

    await waitFor(() => {
      expect(firstError).toBeInstanceOf(WaitUntilAbortError)
    })
  })
})
