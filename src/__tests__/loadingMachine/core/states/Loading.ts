import { Enter } from "../../../../action"
import { state } from "../../../../state"
import { FinishedLoading, Update } from "../actions"
import { loadData } from "../effects"
import { Shared } from "../types"
import Ready from "./Ready"

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
