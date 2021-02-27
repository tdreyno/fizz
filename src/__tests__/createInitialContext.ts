import { createInitialContext as originalCreateInitialContext } from "../context"
import { StateTransition } from "../state"

export const createInitialContext = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  history: Array<StateTransition<any, any, any>>,
  options = {},
) =>
  originalCreateInitialContext(history, {
    disableLogging: true,
    ...options,
  })
