import { state } from "../../../../state"
import { Enter, Exit } from "../../../../action"
import { ReEnter, Reset, reset } from "../actions"
import { goBack } from "../effects"
import { Shared } from "../types"
import { Subscription } from "../../../../subscriptions"
import { subscribe, unsubscribe } from "../../../../effect"

const SUB_NAME = "reset"

type Actions = Enter | Reset | ReEnter | Exit
type Data = [Shared]

export default state<Actions, Data>(
  {
    Enter: () => {
      const sub = new Subscription<Reset>()

      const onResize = () => {
        if (window.innerWidth < 500) {
          void sub.emit(reset())
        }
      }

      window.addEventListener("resize", onResize)

      return subscribe(SUB_NAME, sub, () =>
        window.removeEventListener("resize", onResize),
      )
    },

    Reset: goBack,

    ReEnter: (data, _, { reenter }) => reenter(data),

    Exit: () => unsubscribe(SUB_NAME),
  },
  { debugName: "Ready" },
)
