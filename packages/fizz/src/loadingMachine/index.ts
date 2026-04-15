import { createMachine } from "../createMachine.js"
import * as Actions from "./actions/index.js"
import * as OutputActions from "./outputActions/index.js"
import States from "./states/index.js"

export default createMachine(
  {
    actions: Actions,
    outputActions: OutputActions,
    states: States,
  },
  "LoadingMachine",
)

export { Actions, OutputActions, States }
