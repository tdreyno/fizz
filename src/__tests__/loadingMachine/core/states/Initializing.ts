import { type StartLoading, startLoading } from "../actions"
import type { Enter } from "../../../../action"
import Loading from "./Loading"
import type { Shared } from "../types"
import { state } from "../../../../state"
import type { HandlerReturn } from "../../../../core"

type Actions = Enter | StartLoading
type Data = [Shared, boolean]

export default state<Actions, Data>(
  {
    Enter: startLoading,

    StartLoading: ([shared]): HandlerReturn => Loading([shared, "test"]),
  },
  { name: "Initializing" },
)
