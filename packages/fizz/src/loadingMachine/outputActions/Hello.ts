import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const hello = action("Hello")
export type Hello = ActionCreatorType<typeof hello>
