export { noop, log, goBack, effect } from "@tdreyno/fizz"

import { finishedLoading } from "./actions"

function timeout(ts: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ts))
}

export async function loadData() {
  await timeout(1000)

  return finishedLoading("Your Name")
}
