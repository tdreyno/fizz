import { LoadingMachine } from "@tdreyno/fizz"
import { createStore } from "../createStore.js"

export const machine = createStore(
  LoadingMachine.States,
  LoadingMachine.Actions,
  LoadingMachine.States.Initializing([{ message: "Loading" }, true]),
  LoadingMachine.OutputActions,
)
