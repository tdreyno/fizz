import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const startLoading = action("StartLoading")
export type StartLoading = ActionCreatorType<typeof startLoading>
