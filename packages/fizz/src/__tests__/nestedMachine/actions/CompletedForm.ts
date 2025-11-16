import type { ActionCreatorType } from "../../../action"
import { createAction } from "../../../action"

export const completedForm = createAction<"CompletedForm", string>(
  "CompletedForm",
)
export type CompletedForm = ActionCreatorType<typeof completedForm>
