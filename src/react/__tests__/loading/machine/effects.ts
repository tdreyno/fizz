import { finishedLoading } from "./actions"
export { noop, log, goBack, effect } from "../../../../effect"

function timeout(ts: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ts))
}

export async function loadData() {
  await timeout(3000)

  return finishedLoading("Your Name")
}
