// tslint:disable: jsx-no-multiline-js jsx-wrap-multiline
import React from "react"
import { matchState } from "../../../state"
import { StateContext, States } from "./machine"

const { Initializing, Loading, Ready } = States

export default () => (
  <StateContext.Create
    initialState={Initializing([{ message: "Loading" }, true])}
  >
    {({ currentState }) =>
      matchState<JSX.Element>(currentState)
        .match(Initializing, ([{ message }, bool]) => (
          <>
            <h1>Hello. {message}</h1>
            <p>{bool === true ? "true" : "false"}</p>
          </>
        ))
        .match(Loading, ([{ message }, str]) => (
          <>
            <h1>Hello. {message}</h1>
            <p>{str}</p>
          </>
        ))
        .match(Ready, ([{ message }]) => (
          <>
            <h1>Hello. {message}</h1>
            <p>Ready</p>
          </>
        ))
        .run()
    }
  </StateContext.Create>
)
