import type { ActionCreatorType } from "../../action.js"
import { createAction } from "../../action.js"

export const world = createAction("World")
export type World = ActionCreatorType<typeof world>
