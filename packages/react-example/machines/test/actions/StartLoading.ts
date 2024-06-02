import { type ActionCreatorType, createAction } from "@tdreyno/fizz"

export const startLoading = createAction("StartLoading")
export type StartLoading = ActionCreatorType<typeof startLoading>
