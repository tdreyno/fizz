import { ActionCreatorType, createAction } from "../../../../action"

export const reset = createAction("Reset")
export type Reset = ActionCreatorType<typeof reset>
