import type { Enter } from "../../../action"
import { noop } from "../../../effect"
import { state } from "../../../state"

type Actions = Enter

export default state<Actions, void>(
  {
    Enter: () => noop(),
  },
  { name: "Complete" },
)
