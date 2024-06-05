import { stateV2 } from "../../state.js"
import { output } from "../../effect.js"
import { goBack } from "../effects.js"
import { enter } from "../../action.js"
import { reset, world } from "../actions/index.js"
import type { Shared } from "../types.js"
import { hello } from "../outputActions/index.js"

type Data = [Shared]

export default stateV2<Data>("Ready")
  .on(enter, () => output(hello()))
  .on(reset, goBack)
  .on(world, ([shared], __, { update }) =>
    update([{ ...shared, didWorld: true }]),
  )
