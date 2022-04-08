import type { StateTransition } from "../state"
import { createInitialContext as originalCreateInitialContext } from "../context"

export const createInitialContext = (
  history: Array<StateTransition<any, any, any>>,
  options = {},
) =>
  originalCreateInitialContext(history, {
    disableLogging: true,
    ...options,
  })
