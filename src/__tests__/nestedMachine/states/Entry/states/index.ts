import { Action, enter } from "../../../../../action"
import { History, createInitialContext } from "../../../../../context"
import { createRuntime } from "../../../../../runtime"
import { completedForm } from "../../../actions"
import FormInvalid from "./FormInvalid"
import FormValid from "./FormValid"
import * as NestedActions from "../actions"
import { onNestedContextChange } from ".."

export { FormInvalid, FormValid }

export const initializeNestedRuntime = (
  target: string,
  trigger: (a: Action<any, any>) => void,
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

  nestedRuntime.onParent(action => {
    trigger(action)
  })

  nestedRuntime.onContextChange(ctx => {
    trigger(onNestedContextChange(ctx))
  })

  if (!existingHistoryItems) {
    void nestedRuntime.run(enter())
  }

  return nestedRuntime
}

export const initializeNestedRuntime2 = (
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
