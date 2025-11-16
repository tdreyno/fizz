function timeout(ts: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ts))
}

export { effect, goBack, log, noop } from "../effect.js"
import { finishedLoading } from "./actions/index.js"

export async function loadData() {
  await timeout(3000)

  return finishedLoading("Your Name")
}
