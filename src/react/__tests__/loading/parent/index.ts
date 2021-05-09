import { createFizzContext } from "../../../createFizzContext"
import * as Actions from "./actions"
import States from "./states"

export { States }

export const ParentMachine = createFizzContext(States, Actions, {
  disableLogging: true,
})
