import { Enter } from "../../../../../action"
import { state } from "../../../../../state"
import { StartLoading, startLoading } from "../actions"
import { Shared } from "../types"
import Loading from "./Loading"

type ValidActions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<ValidActions, Data>(
  {
    Enter: () => startLoading(),

    StartLoading: ([shared]) => Loading([shared, "test"]),
  },

  { debugName: "Initializing" },
)
