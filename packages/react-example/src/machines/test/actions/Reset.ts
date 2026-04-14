import { action, type ActionCreatorType } from "@tdreyno/fizz"

export const reset = action("Reset")
export type Reset = ActionCreatorType<typeof reset>
