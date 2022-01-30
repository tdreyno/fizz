import { ActionCreatorType, createAction } from "../../../../action"

export const say = createAction("Say")
export type Say = ActionCreatorType<typeof say>
