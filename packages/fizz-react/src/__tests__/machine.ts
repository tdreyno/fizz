import type { ActionCreatorType, Enter } from "@tdreyno/fizz"
import { action, output, state } from "@tdreyno/fizz"

type Data = {
  didWorld: boolean
}

const world = action("World")
const hello = action("Hello")

type World = ActionCreatorType<typeof world>

const Ready = state<Enter, Data>(
  {
    Enter: () => undefined,
  },
  { name: "Ready" },
)

const Initializing = state<Enter | World, Data>(
  {
    Enter: () => output(hello()),
    World: () => Ready({ didWorld: true }),
  },
  { name: "Initializing" },
)

export const Actions = { world }
export const OutputActions = { hello }
export const States = { Initializing, Ready }
