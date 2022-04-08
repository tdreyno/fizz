import { ReEnter, Reset } from "../actions"
import { goBack, noop } from "../effects"

import { Enter } from "../../../../action"
import { Shared } from "../types"
import { state } from "../../../../state"

type Actions = Enter | Reset | ReEnter
type Data = [Shared]

export default state<Actions, Data>(
  {
    Enter: () => noop(),

    Reset: goBack,

    ReEnter: (data, _, { reenter }) => reenter(data),
  },
  { name: "Ready" },
)
