import { type ActionCreatorType, createAction } from "../../../../action"

export const world = createAction("World")
export type World = ActionCreatorType<typeof world>
