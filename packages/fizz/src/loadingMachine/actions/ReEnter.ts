import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const reEnter = action("ReEnter").withPayload<string>()
export type ReEnter = ActionCreatorType<typeof reEnter>
