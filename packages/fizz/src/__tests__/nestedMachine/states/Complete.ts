import type { Enter } from "../../../action"
import { state } from "../../../state"
import { noop } from "../../../effect"

type Actions = Enter

export default state<Actions, void>(
  {
    Enter: () => noop(),
  },
  { name: "Complete" },
)
