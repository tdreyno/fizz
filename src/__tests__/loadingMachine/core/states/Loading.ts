import type { FinishedLoading, Update } from "../actions"

import type { Enter } from "../../../../action"
import Ready from "./Ready"
import type { Shared } from "../types"
import { loadData } from "../effects"
import { state } from "../../../../state"
import type { HandlerReturn } from "../../../../core"

type Actions = Enter | FinishedLoading | Update
type Data = [Shared, string]

export default state<Actions, Data>({
  Enter: loadData,

  FinishedLoading: ([shared], name): HandlerReturn =>
    Ready([{ ...shared, message: `Hi, ${name}` }]),

  Update: ([shared, str], _, { update }) =>
    update([
      { ...shared, message: shared.message + " " + shared.message },
      str,
    ]),
})
