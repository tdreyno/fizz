import { createFizzContext } from "../../../createFizzContext"
import * as Actions from "./actions"
import States from "./states"

export { States }

export const StateContext = createFizzContext(States, Actions, {
  disableLogging: true,
})
