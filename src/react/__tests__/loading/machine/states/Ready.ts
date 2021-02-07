import { StateReturn, state } from "../../../../../state"
import { Enter, Exit } from "../../../../../action"
import { ReEnter, Reset, reset } from "../actions"
import { goBack } from "../effects"
import { Shared } from "../types"
import { Subscription } from "../../../../../subscriptions"
import { subscribe, unsubscribe } from "../../../../../effect"

async function Ready(
  action: Enter | Reset | ReEnter | Exit,
  shared: Shared,
): Promise<StateReturn> {
  const sub = new Subscription<Reset>()

  const onResize = () => {
    if (window.innerWidth < 500) {
      void sub.emit(reset())
    }
  }

  switch (action.type) {
    case "Enter":
      window.addEventListener("resize", onResize)

      return subscribe("reset", sub)

    case "Reset":
      return goBack()

    case "ReEnter":
      return reenter(shared)

    case "Exit":
      window.removeEventListener("resize", onResize)

      return unsubscribe("reset")
  }
}

const ReadyState = state("Ready", Ready)
// eslint-disable-next-line @typescript-eslint/unbound-method
const { reenter } = ReadyState
export default ReadyState
