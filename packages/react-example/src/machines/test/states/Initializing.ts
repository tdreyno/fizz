import { type Enter, state } from "@tdreyno/fizz"
import { type StartLoading, startLoading } from "../actions"
import Loading from "./Loading"
import type { Shared } from "../types"

type Actions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<Actions, Data>(
  {
    Enter: startLoading,

    StartLoading: ([shared]) => Loading([shared, "test"]),
  },
  { name: "Initializing" },
)
