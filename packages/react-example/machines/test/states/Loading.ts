import { type Enter, state } from "@tdreyno/fizz"
import type { FinishedLoading, Update } from "../actions"
import Ready from "./Ready"
import type { Shared } from "../types"
import { loadData } from "../effects"

type Actions = Enter | FinishedLoading | Update
type Data = [Shared, string]

export default state<Actions, Data>({
  Enter: loadData,

  FinishedLoading: ([shared], name) =>
    Ready([{ ...shared, message: `Hi, ${name}` }]),

  Update: ([shared, str], _, { update }) =>
    update([
      { ...shared, message: shared.message + " " + shared.message },
      str,
    ]),
})
