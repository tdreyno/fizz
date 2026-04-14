import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const reset = action("Reset")
export type Reset = ActionCreatorType<typeof reset>
