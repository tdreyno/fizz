import { Enter } from "../../../../../action"
import { noop } from "../../../../../effect"
import { state, StateReturn } from "../../../../../state"
import { Say } from "../actions"

async function Entry(
  action: Enter | Say,
): Promise<StateReturn | StateReturn[]> {
  switch (action.type) {
    case "Enter":
      return noop()

    case "Say":
      return noop()
  }
}

export default state("Entry", Entry)
