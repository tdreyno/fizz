import { useContext } from "react"
import { createFizzContext } from "../../../createFizzContext"
import { StateContext as ParentStateContext } from "../parent"
import * as Actions from "./actions"
import States from "./states"

export { States }

export const StateContext = createFizzContext(States, Actions, {
  parent: ParentStateContext,
  disableLogging: true,
})

export const useLoadingMachine = () => {
  const { currentState, actions } = useContext(StateContext.Context)

  return { currentState, actions }
}
