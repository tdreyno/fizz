import type { Enter } from "../../../../../action"
import { state } from "../../../../../state"
import { parent } from "../../../../../effect"
import { completedForm } from "../../../actions/CompletedForm"
import type { FormData } from "../types"

export default state<Enter, FormData>(
  {
    Enter(data) {
      return parent(completedForm(data.name))
    },
  },
  { name: "FormValid" },
)
