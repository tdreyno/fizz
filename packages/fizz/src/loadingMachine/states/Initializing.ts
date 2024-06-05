import { enter } from "../../action.js"
import { stateV2 } from "../../state.js"
import { startLoading } from "../actions/index.js"
import Loading from "./Loading.js"
import type { Shared } from "../types.js"

type Data = [Shared, boolean]

export default stateV2<Data>("Initializing")
  .on(enter, startLoading)
  .on(startLoading, ([shared]) => Loading([shared, "test"]))
