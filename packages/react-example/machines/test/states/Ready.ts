import { state, output, type Enter, noop } from "@tdreyno/fizz"
import { goBack } from "../effects"
import type { Reset, World } from "../actions"
import type { Shared } from "../types"

type Actions = Enter | Reset | World
type Data = [Shared]

export default state<Actions, Data>(
  {
    Enter: () => noop(),

    Reset: goBack,

    World: ([shared], __, { update }) => {
      return update([{ ...shared, didWorld: true }])
    },
  },
  { name: "Ready" },
)
