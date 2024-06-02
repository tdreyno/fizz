import { useMachine } from "@tdreyno/fizz-react"
import * as Actions from "./actions"
import States from "./states"

export const useTestMachine = () => {
  return useMachine(
    States,
    Actions,
    States.Initializing([{ message: "Loading" }, true]),
  )
}
