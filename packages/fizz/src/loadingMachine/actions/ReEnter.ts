import { type ActionCreatorType, createAction } from "../../action.js"

export const reEnter = createAction<"ReEnter", string>("ReEnter")
export type ReEnter = ActionCreatorType<typeof reEnter>
