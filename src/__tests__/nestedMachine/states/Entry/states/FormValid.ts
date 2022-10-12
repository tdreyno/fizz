import type { Enter } from "../../../../../action"
import { state } from "../../../../../state"
import { completedForm } from "../../../actions/CompletedForm"
import type { FormData } from "../types"

export default state<Enter, FormData>(
  {
    Enter(data, _, { parentRuntime }) {
      void parentRuntime?.run(completedForm(data.name))
    },
  },
  { name: "FormValid" },
)
