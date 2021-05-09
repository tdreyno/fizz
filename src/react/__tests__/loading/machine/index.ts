import { createFizzContext } from "../../../createFizzContext"
import { ParentMachine } from "../parent"
import * as Actions from "./actions"
import States from "./states"

export { States }

export const LoadingMachine = createFizzContext(States, Actions, {
  parent: ParentMachine,
  disableLogging: true,
})
