import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const finishedLoading = action("FinishedLoading").withPayload<string>()
export type FinishedLoading = ActionCreatorType<typeof finishedLoading>
