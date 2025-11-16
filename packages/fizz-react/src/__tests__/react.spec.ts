/**
 * @jest-environment jsdom
 */

import { LoadingMachine } from "@tdreyno/fizz"
import { act, renderHook } from "@testing-library/react"

import { useMachine } from "../useMachine"

describe("React integration", () => {
  test("inital render", async () => {
    const { result } = renderHook(() =>
      useMachine(
        LoadingMachine.States,
        LoadingMachine.Actions,
        LoadingMachine.States.Initializing([{ message: "Loading" }, true]),
        LoadingMachine.OutputActions,
      ),
    )

    expect(result.current.currentState.state).toBe(
      LoadingMachine.States.Initializing,
    )
    expect(result.current.currentState.name).toBe("Initializing")
    expect(result.current.currentState.data[0].didWorld).toBeUndefined()

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    expect(result.current.currentState.state).toBe(LoadingMachine.States.Ready)
    expect(result.current.currentState.name).toBe("Ready")
    expect(result.current.currentState.data[0].didWorld).toBeTruthy()
  })
})
