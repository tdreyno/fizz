import { enter } from "../../../../../action"
import { History, createInitialContext } from "../../../../../context"
import { createRuntime } from "../../../../../runtime"
import { completedForm } from "../../../actions"
import FormInvalid from "./FormInvalid"
import FormValid from "./FormValid"
import * as NestedActions from "../actions"

export { FormInvalid, FormValid }

export const initializeNestedRuntime = (
  target: string,
  existingHistoryItems?: History["items"],
) => {
  const nestedRuntime = createRuntime(
    createInitialContext(
      existingHistoryItems ?? [FormInvalid({ target, name: "" })],
    ),
    NestedActions,
    {},
    { completedForm },
  )

  if (!existingHistoryItems) {
    void nestedRuntime.run(enter())
  }

  return nestedRuntime
}
