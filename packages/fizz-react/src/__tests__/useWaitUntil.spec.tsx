/**
 * @jest-environment jsdom
 */

import { describe, expect, test } from "@jest/globals"
import type { ActionCreatorType, Enter } from "@tdreyno/fizz"
import {
  action,
  createMachine,
  matchOutput,
  matchState,
  output,
  state,
  WaitUntilAbortError,
} from "@tdreyno/fizz"
import { act, renderHook, waitFor } from "@testing-library/react"

import { useMachine } from "../useMachine"
import {
  useRunUntil,
  useWaitUntilOutput,
  useWaitUntilState,
} from "../useWaitUntil"
import { Machine, States } from "./machine"

// A second machine whose output fires on a dispatched action (not on Enter)
// so output subscribers can register before the action is emitted.
const ping = action("Ping")
const pong = action("Pong")
type Ping = ActionCreatorType<typeof ping>

const Idle = state<Enter | Ping, { count: number }>(
  {
    Enter: () => undefined,
    Ping: () => output(pong()),
  },
  { name: "Idle" },
)

const OutputMachine = createMachine(
  {
    actions: { ping },
    outputActions: { pong },
    states: { Idle },
  },
  "OutputTestMachine",
)

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

    const previousResult = result.current.waitResult
    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    // After unmount the cancelled guard prevents any state update, so the
    // last-rendered result is still the pending one.
    expect(previousResult.status).toBe("pending")
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

describe("useWaitUntilOutput", () => {
  test("resolves on first matching output after dispatch", async () => {
    const { result } = renderHook(() => {
      const machine = useMachine(
        OutputMachine,
        OutputMachine.states.Idle({ count: 0 }),
      )

      const waitResult = useWaitUntilOutput(machine.runtime, matchOutput(pong))

      return { actions: machine.actions, waitResult }
    })

    expect(result.current.waitResult.status).toBe("pending")

    const typedPing: () => { asPromise: () => Promise<void> } =
      result.current.actions.ping
    await act(async () => {
      await typedPing().asPromise()
    })

    await waitFor(() => {
      expect(result.current.waitResult.status).toBe("resolved")
    })
  })

  test("aborts pending wait on unmount", async () => {
    const { result, unmount } = renderHook(() => {
      const machine = useMachine(
        OutputMachine,
        OutputMachine.states.Idle({ count: 0 }),
      )

      const waitResult = useWaitUntilOutput(machine.runtime, matchOutput(pong))

      return { waitResult }
    })

    const previousResult = result.current.waitResult
    expect(previousResult.status).toBe("pending")

    unmount()
    await act(async () => {
      await Promise.resolve()
    })
    expect(previousResult.status).toBe("pending")
  })

  test("restarts the wait when deps change", async () => {
    let depToken = 0
    const { result, rerender } = renderHook(
      ({ token }: { token: number }) => {
        const machine = useMachine(
          OutputMachine,
          OutputMachine.states.Idle({ count: 0 }),
        )

        const waitResult = useWaitUntilOutput(
          machine.runtime,
          matchOutput(pong),
          {
            deps: [token],
          },
        )

        return { actions: machine.actions, waitResult }
      },
      { initialProps: { token: depToken } },
    )

    expect(result.current.waitResult.status).toBe("pending")

    depToken = 1
    rerender({ token: depToken })

    expect(result.current.waitResult.status).toBe("pending")

    const typedPing: () => { asPromise: () => Promise<void> } =
      result.current.actions.ping
    await act(async () => {
      await typedPing().asPromise()
    })

    await waitFor(() => {
      expect(result.current.waitResult.status).toBe("resolved")
    })
  })
})
