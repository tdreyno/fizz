import { ActionCreatorType, createAction } from "../../../../action"

export const reEnter = createAction<"ReEnter", string>("ReEnter")
export type ReEnter = ActionCreatorType<typeof reEnter>
