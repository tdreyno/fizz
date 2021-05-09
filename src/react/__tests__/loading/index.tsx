// tslint:disable: jsx-no-multiline-js jsx-wrap-multiline
import React from "react"
import { switch_ } from "../../../state"
import { LoadingMachine, States } from "./machine"

const { Initializing, Loading, Ready } = States

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
