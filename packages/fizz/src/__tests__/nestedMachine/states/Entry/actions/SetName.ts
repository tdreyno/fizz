import type { ActionCreatorType } from "../../../../../action"
import { action } from "../../../../../action"

export const setName = action("SetName").withPayload<string>()
export type SetName = ActionCreatorType<typeof setName>
