/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react"
import * as Core from "../../__tests__/loadingMachine/core"
import { useMachine } from "../useMachine"

describe("React integration", () => {
  test("inital render", async () => {
    const { result } = renderHook(() =>
      useMachine(
        Core.States,
        Core.Actions,
        Core.States.Initializing([{ message: "Loading" }, true]),
        Core.OutputActions,
      ),
    )

    expect(result.current.currentState.state).toBe(Core.States.Initializing)
    expect(result.current.currentState.name).toBe("Initializing")
    expect(result.current.currentState.data[0].didWorld).toBeUndefined()

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    expect(result.current.currentState.state).toBe(Core.States.Ready)
    expect(result.current.currentState.name).toBe("Ready")
    expect(result.current.currentState.data[0].didWorld).toBeTruthy()
  })
})
