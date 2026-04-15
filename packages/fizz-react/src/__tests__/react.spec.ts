/**
 * @jest-environment jsdom
 */

import { act, renderHook } from "@testing-library/react"

import { useMachine } from "../useMachine"
import { Machine, States } from "./machine"

describe("React integration", () => {
  test("inital render", async () => {
    const { result } = renderHook(() =>
      useMachine(Machine, Machine.states.Initializing({ didWorld: false })),
    )
    const typedWorld: () => { asPromise: () => Promise<void> } =
      result.current.actions.world
    const typedDidWorld: boolean = result.current.currentState.data.didWorld

    expect(result.current.currentState.state).toBe(States.Initializing)
    expect(result.current.currentState.name).toBe("Initializing")
    expect(result.current.currentState.data.didWorld).toBeFalsy()
    expect(typeof typedWorld).toBe("function")
    expect(typedDidWorld).toBeFalsy()

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    expect(result.current.currentState.state).toBe(States.Ready)
    expect(result.current.currentState.name).toBe("Ready")
    expect(result.current.currentState.data.didWorld).toBeTruthy()
  })
})
