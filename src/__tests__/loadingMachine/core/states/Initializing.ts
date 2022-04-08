import { StartLoading, startLoading } from "../actions"

import { Enter } from "../../../../action"
import Loading from "./Loading"
import { Shared } from "../types"
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
