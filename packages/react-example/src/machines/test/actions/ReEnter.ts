import { action, type ActionCreatorType } from "@tdreyno/fizz"

export const reEnter = action("ReEnter").withPayload<string>()
export type ReEnter = ActionCreatorType<typeof reEnter>
