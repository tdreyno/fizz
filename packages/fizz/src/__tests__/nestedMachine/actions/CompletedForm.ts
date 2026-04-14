import type { ActionCreatorType } from "../../../action"
import { action } from "../../../action"

export const completedForm = action("CompletedForm").withPayload<string>()
export type CompletedForm = ActionCreatorType<typeof completedForm>
