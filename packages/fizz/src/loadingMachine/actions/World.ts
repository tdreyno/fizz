import type { ActionCreatorType } from "../../action.js"
import { action } from "../../action.js"

export const world = action("World")
export type World = ActionCreatorType<typeof world>
