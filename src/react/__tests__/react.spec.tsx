/**
 * @jest-environment jsdom
 */

import "@testing-library/jest-dom/extend-expect"

import * as Core from "../../__tests__/loadingMachine/core"

import { createFizzContext, useMachine } from "../createFizzContext"
import { render, screen, waitFor } from "@testing-library/react"

import React from "react"
import { switch_ } from "../../state"

const LoadingMachine = createFizzContext(Core.States, Core.Actions)

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

describe.skip("React integration", () => {
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

    await waitFor(() =>
      expect(screen.getByRole("name")).toHaveTextContent("Ready"),
    )
  })
})
