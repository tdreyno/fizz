import { state } from "../../../../../state"
import type { SetName } from "../actions"
import type { FormData } from "../types"
import FormValid from "./FormValid"

export default state<SetName, FormData>(
  {
    SetName(data, name, { update, parentRuntime }) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (name === (parentRuntime?.currentState().data as any).targetName) {
        return FormValid({ ...data, name })
      }

      return update({ ...data, name })
    },
  },
  { name: "FormInvalid" },
)
