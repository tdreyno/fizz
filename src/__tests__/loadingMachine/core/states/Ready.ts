import { goBack } from "../effects"
import type { Enter } from "../../../../action"
import type { Reset, World } from "../actions"
import type { Shared } from "../types"
import { state } from "../../../../state"
import { output } from "../../../../effect"
import { hello } from "../outputActions"

type Actions = Enter | Reset | World // | ReEnter
type Data = [Shared]

export default state<Actions, Data>(
  {
    Enter: () => output(hello()),

    Reset: goBack,

    World: ([shared], __, { update }) => {
      return update([{ ...shared, didWorld: true }])
    },

    // ReEnter: (data, _, { reenter }) => reenter(data),
  },
  { name: "Ready" },
)
