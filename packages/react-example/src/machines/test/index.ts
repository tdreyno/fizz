import { createMachine } from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"
import * as Actions from "./actions"
import States from "./states"

const TestMachine = createMachine({
  actions: Actions,
  name: "TestMachine",
  states: States,
})

export default TestMachine

export const useTestMachine = () => {
  return useMachine(
    TestMachine,
    TestMachine.states.Initializing([{ message: "Loading" }, true]),
  )
}
