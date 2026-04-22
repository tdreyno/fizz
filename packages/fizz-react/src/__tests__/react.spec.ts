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
    const typedIsReady: boolean | undefined = result.current.selectors.isReady

    expect(result.current.states).toBe(Machine.states)
    expect(
      result.current.currentState.is(result.current.states.Initializing),
    ).toBe(true)

    if (!result.current.currentState.is(result.current.states.Initializing)) {
      throw new Error("Expected Initializing state")
    }

    const initializingData = result.current.currentState.data as {
      didWorld: boolean
    }
    const typedDidWorld: boolean = initializingData.didWorld

    expect(result.current.currentState.name).toBe("Initializing")
    expect(initializingData.didWorld).toBeFalsy()
    expect(typeof typedWorld).toBe("function")
    expect(typedDidWorld).toBeFalsy()
    expect(typedIsReady).toBeUndefined()

    await act(async () => {
      await result.current.actions.world().asPromise()
    })

    const readyData = result.current.currentState.data as {
      didWorld: boolean
    }

    expect(result.current.currentState.is(States.Ready)).toBe(true)
    expect(result.current.currentState.name).toBe("Ready")
    expect(readyData.didWorld).toBeTruthy()
    expect(result.current.selectors.isReady).toBe(true)
  })
})
