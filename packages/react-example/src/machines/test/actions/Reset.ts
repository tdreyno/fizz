import { type ActionCreatorType, createAction } from "@tdreyno/fizz"

export const reset = createAction("Reset")
export type Reset = ActionCreatorType<typeof reset>
