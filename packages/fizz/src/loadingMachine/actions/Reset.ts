import type { ActionCreatorType } from "../../action.js"
import { createAction } from "../../action.js"

export const reset = createAction("Reset")
export type Reset = ActionCreatorType<typeof reset>
