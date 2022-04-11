import * as Core from "../../__tests__/loadingMachine/core"

import { createStore } from "../createStore"

export const machine = createStore(
  Core.States,
  Core.Actions,
  Core.States.Initializing([{ message: "Loading" }, true]),
  {
    disableLogging: true,
  },
)
