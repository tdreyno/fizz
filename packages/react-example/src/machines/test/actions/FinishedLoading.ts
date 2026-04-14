import { action, type ActionCreatorType } from "@tdreyno/fizz"

export const finishedLoading = action("FinishedLoading").withPayload<string>()
export type FinishedLoading = ActionCreatorType<typeof finishedLoading>
