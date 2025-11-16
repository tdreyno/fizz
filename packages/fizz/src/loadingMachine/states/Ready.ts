import type { Enter } from "../../action.js"
import { output } from "../../effect.js"
import { state } from "../../state.js"
import type { Reset, World } from "../actions/index.js"
import { goBack } from "../effects.js"
import { hello } from "../outputActions/index.js"
import type { Shared } from "../types.js"

type Actions = Enter | Reset | World
type Data = [Shared]

export default state<Actions, Data>(
  {
    Enter: () => output(hello()),

    Reset: goBack,

    World: ([shared], __, { update }) => {
      return update([{ ...shared, didWorld: true }])
    },
  },
  { name: "Ready" },
)
