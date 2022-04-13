import { goBack, noop } from "../effects"

import type { Enter } from "../../../../action"
import type { Reset } from "../actions"
import type { Shared } from "../types"
import { state } from "../../../../state"

type Actions = Enter | Reset // | ReEnter
type Data = [Shared]

export default state<Actions, Data>(
  {
    Enter: () => noop(),

    Reset: goBack,

    // ReEnter: (data, _, { reenter }) => reenter(data),
  },
  { name: "Ready" },
)
