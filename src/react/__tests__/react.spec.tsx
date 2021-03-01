/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import React from "react"
import { render, screen, act, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/extend-expect"
import { StateContext, States, useLoadingMachine } from "./loading/machine"

describe("React integration", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    // jest.runOnlyPendingTimers()
    jest.useRealTimers()
  })

  const ShowState = () => {
    const { currentState } = useLoadingMachine()

    return <div role="name">{currentState.name}</div>
  }

  test("inital render", async () => {
    render(
      <StateContext.Create
        initialState={States.Initializing([{ message: "Loading" }, true])}
      >
        {() => <ShowState />}
      </StateContext.Create>,
    )

    expect(screen.getByRole("name")).toHaveTextContent("Initializing")
  })

  test("load on next frame", async () => {
    render(
      <StateContext.Create
        initialState={States.Initializing([{ message: "Loading" }, true])}
      >
        {() => <ShowState />}
      </StateContext.Create>,
    )

    act(() => {
      jest.runAllTimers()
    })

    await waitFor(() =>
      expect(screen.getByRole("name")).toHaveTextContent("Ready"),
    )
  })
})
