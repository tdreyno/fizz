/**
 * @jest-environment jsdom
 */

import "@tdreyno/fizz/browser"

import { jest } from "@jest/globals"
import type { ActionCreatorType, Enter } from "@tdreyno/fizz"
import { action, createMachine, effect, noop, state } from "@tdreyno/fizz"
import { act, renderHook } from "@testing-library/react"

import { useMachine } from "../useMachine"

describe("React browser driver option", () => {
  test("should pass driver through useMachine options", async () => {
    const startConfirm = action("StartConfirm")
    type StartConfirm = ActionCreatorType<typeof startConfirm>
    const confirmMock = jest.fn(() => "accept")

    type Data = {
      started: boolean
    }

    const Confirming = state<Enter, Data>(
      {
        Enter: () => effect("confirm", { message: "Proceed?" }),
      },
      { name: "Confirming" },
    )

    const Ready = state<Enter | StartConfirm, Data>(
      {
        Enter: noop,
        StartConfirm: data =>
          Confirming({
            ...data,
            started: true,
          }),
      },
      { name: "Ready" },
    )

    const machine = createMachine({
      actions: { startConfirm },
      states: {
        Confirming,
        Ready,
      },
    })

    const { result } = renderHook(() =>
      useMachine(machine, Ready({ started: false }), {
        driver: {
          confirm: confirmMock,
        },
      }),
    )

    await act(async () => {
      await result.current.actions.startConfirm().asPromise()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(confirmMock).toHaveBeenCalledWith("Proceed?")
  })
})
