import { type ActionCreatorType, createAction } from "../../action.js"

export const world = createAction("World")
export type World = ActionCreatorType<typeof world>
