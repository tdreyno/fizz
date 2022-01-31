import * as Core from "../../__tests__/loadingMachine/core"

import { createMachine } from "../createMachine"

export const machine = createMachine(
  Core.States,
  Core.Actions,
  Core.States.Initializing([{ message: "Loading" }, true]),
  {
    disableLogging: true,
  },
)
