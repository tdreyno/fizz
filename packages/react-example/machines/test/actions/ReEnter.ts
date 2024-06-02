import { type ActionCreatorType, createAction } from "@tdreyno/fizz"

export const reEnter = createAction<"ReEnter", string>("ReEnter")
export type ReEnter = ActionCreatorType<typeof reEnter>
