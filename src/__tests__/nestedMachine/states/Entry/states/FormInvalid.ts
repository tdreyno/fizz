import type { HandlerReturn } from "../../../../../core"
import { state } from "../../../../../state"
import type { SetName } from "../actions"
import type { FormData } from "../types"
import FormValid from "./FormValid"

export default state<SetName, FormData>(
  {
    SetName({ target }, name, { update }): HandlerReturn {
      if (name === target) {
        return FormValid({ target, name })
      }

      return update({ target, name })
    },
  },
  { name: "FormInvalid" },
)
