import { ActionCreatorType, createAction } from "../../../../../action"

export const finishedLoading = createAction<"FinishedLoading", string>(
  "FinishedLoading",
)
export type FinishedLoading = ActionCreatorType<typeof finishedLoading>
