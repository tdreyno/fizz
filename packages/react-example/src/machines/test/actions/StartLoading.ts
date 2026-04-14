import { action, type ActionCreatorType } from "@tdreyno/fizz"

export const startLoading = action("StartLoading")
export type StartLoading = ActionCreatorType<typeof startLoading>
