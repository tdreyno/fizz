import { enter } from "../../action.js"
import { stateV2 } from "../../state.js"
import { finishedLoading, update } from "../actions/index.js"
import Ready from "./Ready.js"
import type { Shared } from "../types.js"
import { loadData } from "../effects.js"

type Data = [Shared, string]

export default stateV2<Data>("Loading")
  .on(enter, loadData)

  .on(finishedLoading, ([shared], name) =>
    Ready([{ ...shared, message: `Hi, ${name}` }]),
  )

  .on(update, ([shared, str], _, { update }) =>
    update([
      { ...shared, message: shared.message + " " + shared.message },
      str,
    ]),
  )
