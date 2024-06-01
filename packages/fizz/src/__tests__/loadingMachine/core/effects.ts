import { timeout } from "../../util"
import { finishedLoading } from "./actions"
export { noop, log, goBack, effect } from "../../../effect"

export async function loadData() {
  await timeout(3000)

  return finishedLoading("Your Name")
}
