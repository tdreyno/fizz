import type { Enter } from "../../action.js"
import { state } from "../../state.js"
import type { StartLoading } from "../actions/index.js"
import { startLoading } from "../actions/index.js"
import type { Shared } from "../types.js"
import Loading from "./Loading.js"

type Actions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<Actions, Data>(
  {
    Enter: startLoading,

    StartLoading: ([shared]) => Loading([shared, "test"]),
  },
  { name: "Initializing" },
)
