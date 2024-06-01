import type { Enter } from "../../action.js"
import { state } from "../../state.js"
import { type StartLoading, startLoading } from "../actions/index.js"
import Loading from "./Loading.js"
import type { Shared } from "../types.js"

type Actions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<Actions, Data>(
  {
    Enter: startLoading,

    StartLoading: ([shared]) => Loading([shared, "test"]),
  },
  { name: "Initializing" },
)
