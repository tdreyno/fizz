import { type ActionCreatorType, createAction } from "@tdreyno/fizz"

export const finishedLoading = createAction<"FinishedLoading", string>(
  "FinishedLoading",
)
export type FinishedLoading = ActionCreatorType<typeof finishedLoading>
