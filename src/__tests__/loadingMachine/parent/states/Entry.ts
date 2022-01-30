import { Enter } from "../../../../action"
import { noop } from "../../../../effect"
import { state } from "../../../../state"
import { Say } from "../actions"

type Actions = Enter | Say

export default state<Actions>({
  Enter: noop,

  Say: noop,
})
