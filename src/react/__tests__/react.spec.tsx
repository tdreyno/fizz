/**
 * @jest-environment jsdom
 */

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import React from "react"
import { render, screen, act, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/extend-expect"
import * as Core from "../../__tests__/loadingMachine/core"
import * as Parent from "../../__tests__/loadingMachine/parent"
import { useMachine, createFizzContext } from "../createFizzContext"
import { switch_ } from "../../state"

const ParentMachine = createFizzContext(Parent.States, Parent.Actions, {
  disableLogging: true,
})

const LoadingMachine = createFizzContext(Core.States, Core.Actions, {
  parent: ParentMachine,
  disableLogging: true,
})

const { Initializing, Loading, Ready } = Core.States

export default () => (
  <LoadingMachine.Provider
    initialState={Initializing([{ message: "Loading" }, true])}
  >
    {({ currentState }) =>
      switch_<JSX.Element>(currentState)
        .case_(Initializing, ([{ message }, bool]) => (
          <>
            <h1>Hello. {message}</h1>
            <p>{bool === true ? "true" : "false"}</p>
          </>
        ))
        .case_(Loading, ([{ message }, str]) => (
          <>
            <h1>Hello. {message}</h1>
            <p>{str}</p>
          </>
        ))
        .case_(Ready, ([{ message }]) => (
          <>
            <h1>Hello. {message}</h1>
            <p>Ready</p>
          </>
        ))
        .run()
    }
  </LoadingMachine.Provider>
)

describe("React integration", () => {
  beforeEach(() => {
    jest.useFakeTimers("modern")
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
        initialState={Core.States.Initializing([{ message: "Loading" }, true])}
      >
        {() => <ShowState />}
      </LoadingMachine.Provider>,
    )

    expect(screen.getByRole("name")).toHaveTextContent("Initializing")
  })

  test("load on next frame", async () => {
    render(
      <LoadingMachine.Provider
        initialState={Core.States.Initializing([{ message: "Loading" }, true])}
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
