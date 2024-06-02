function timeout(ts: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ts))
}

export { noop, log, goBack, effect } from "../effect.js"
import { finishedLoading } from "./actions/index.js"

export async function loadData() {
  await timeout(3000)

  return finishedLoading("Your Name")
}
