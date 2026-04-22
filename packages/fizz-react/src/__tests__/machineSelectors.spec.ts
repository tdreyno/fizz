/**
 * @jest-environment jsdom
 */

import type { ActionCreatorType, Enter } from "@tdreyno/fizz"
import { action, createMachine, noop, selectWhen, state } from "@tdreyno/fizz"
import { act, renderHook, waitFor } from "@testing-library/react"

import { useMachine } from "../useMachine"

type InitializingData = {
  phase: "init"
}

type ReadyData = {
  count: number
}

const start = action("Start")
const bump = action("Bump")

type Start = ActionCreatorType<typeof start>
type Bump = ActionCreatorType<typeof bump>

const Initializing = state<Enter | Start, InitializingData>(
  {
    Enter: noop,
    Start: () => Ready({ count: 0 }),
  },
  { name: "Initializing" },
)

const Ready = state<Enter | Bump, ReadyData>(
  {
    Enter: noop,
    Bump: (data, _, { update }) =>
      update({
        count: data.count + 2,
      }),
  },
  { name: "Ready" },
)

const SelectorMachine = createMachine(
  {
    actions: { bump, start },
    selectors: {
      isReady: selectWhen(Ready, () => true),
      parityLoose: selectWhen(Ready, (data: ReadyData) => ({
        parity: data.count % 2,
      })),
      parityStable: selectWhen(
        Ready,
        (data: ReadyData) => ({
          parity: data.count % 2,
        }),
        {
          equalityFn: (
            a: { parity: number } | undefined,
            b: { parity: number } | undefined,
          ) => a?.parity === b?.parity,
        },
      ),
    },
    states: { Initializing, Ready },
  },
  "SelectorMachine",
)

describe("machine selectors on useMachine", () => {
  test("exposes colocated selectors on the machine value", async () => {
    const { result } = renderHook(() => {
      const machine = useMachine(
        SelectorMachine,
        SelectorMachine.states.Initializing({ phase: "init" }),
      )

      return {
        machine,
      }
    })

    expect(result.current.machine.selectors.isReady).toBeUndefined()

    await act(async () => {
      await result.current.machine.actions.start().asPromise()
    })

    await waitFor(() => {
      expect(result.current.machine.selectors.isReady).toBe(true)
    })
  })

  test("applies selector equalityFn to avoid selected-value churn", async () => {
    const { result } = renderHook(() => {
      const machine = useMachine(
        SelectorMachine,
        SelectorMachine.states.Initializing({ phase: "init" }),
      )

      return machine
    })

    await act(async () => {
      await result.current.actions.start().asPromise()
    })

    await waitFor(() => {
      expect(result.current.selectors.parityStable.parity).toBe(0)
      expect(result.current.selectors.parityLoose.parity).toBe(0)
    })

    await act(async () => {
      await result.current.actions.bump().asPromise()
    })

    await waitFor(() => {
      expect(result.current.selectors.parityStable.parity).toBe(0)
      expect(result.current.selectors.parityLoose.parity).toBe(0)
    })
  })
})
