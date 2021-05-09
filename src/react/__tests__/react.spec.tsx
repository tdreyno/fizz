/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import React from "react"
import { render, screen, act, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/extend-expect"
import { LoadingMachine, States } from "./loading/machine"
import { useMachine } from "../createFizzContext"

describe("React integration", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    // jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  const ShowState = () => {
    const { currentState } = useMachine(LoadingMachine)

    return <div role="name">{currentState.name}</div>
  }

  test("inital render", async () => {
    render(
      <LoadingMachine.Provider
        initialState={States.Initializing([{ message: "Loading" }, true])}
      >
        {() => <ShowState />}
      </LoadingMachine.Provider>,
    )

    expect(screen.getByRole("name")).toHaveTextContent("Initializing")
  })

  test("load on next frame", async () => {
    render(
      <LoadingMachine.Provider
        initialState={States.Initializing([{ message: "Loading" }, true])}
      >
        {() => <ShowState />}
      </LoadingMachine.Provider>,
    )

    act(() => {
      jest.runAllTimers()
    })

    await waitFor(() =>
      expect(screen.getByRole("name")).toHaveTextContent("Ready"),
    )
  })
})
