import { createInitialContext as originalCreateInitialContext } from "../context"
import { StateTransition } from "../state"

export const createInitialContext = (
  history: Array<StateTransition<any, any, any>>,
  options = {},
) =>
  originalCreateInitialContext(history, {
    disableLogging: true,
    ...options,
  })
