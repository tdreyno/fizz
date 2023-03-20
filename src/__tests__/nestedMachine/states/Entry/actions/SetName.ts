import { type ActionCreatorType, createAction } from "../../../../../action"

export const setName = createAction<"SetName", string>("SetName")
export type SetName = ActionCreatorType<typeof setName>
