import type { Enter } from "../../action.js"
import { state } from "../../state.js"
import type { FinishedLoading, Update } from "../actions/index.js"
import { loadData } from "../effects.js"
import type { Shared } from "../types.js"
import Ready from "./Ready.js"

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
