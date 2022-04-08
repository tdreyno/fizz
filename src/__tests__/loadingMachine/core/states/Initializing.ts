import { StartLoading, startLoading } from "../actions"

import type { Enter } from "../../../../action"
import Loading from "./Loading"
import type { Shared } from "../types"
import { state } from "../../../../state"

type Actions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<Actions, Data>(
  {
    Enter: startLoading,

    StartLoading: ([shared]) => Loading([shared, "test"]),
  },
  { name: "Initializing" },
)
