import type { ActionCreatorType } from "../../../../../action"
import { createAction } from "../../../../../action"

export const setName = createAction<"SetName", string>("SetName")
export type SetName = ActionCreatorType<typeof setName>
