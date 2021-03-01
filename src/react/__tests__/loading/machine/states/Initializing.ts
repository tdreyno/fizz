import { Enter } from "../../../../../action"
import { state } from "../../../../../state"
import { StartLoading, startLoading } from "../actions"
import { Shared } from "../types"
import Loading from "./Loading"

type Actions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<Actions, Data>(
  {
    Enter: startLoading,

    StartLoading: ([shared]) => Loading([shared, "test"]),
  },
  { debugName: "Initializing" },
)
