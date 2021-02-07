import { Enter } from "../../../../../action"
import { state, StateReturn } from "../../../../../state"
import { StartLoading, startLoading } from "../actions"
import { Shared } from "../types"
import Loading from "./Loading"

async function Initializing(
  action: Enter | StartLoading,
  shared: Shared,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _bool: boolean,
): Promise<StateReturn | StateReturn[]> {
  switch (action.type) {
    case "Enter":
      return startLoading()

    case "StartLoading":
      return Loading(shared, "test")
  }
}

export default state("Initializing", Initializing)
