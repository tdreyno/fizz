import { createMachine } from "../../createMachine.js"
import * as Actions from "./actions"
import States from "./states"

export default createMachine({
  actions: Actions,
  name: "NestedMachine",
  states: States,
})

export { Actions, States }
