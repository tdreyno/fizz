import { type ActionCreatorType, createAction } from "../../action.js"

export const finishedLoading = createAction<"FinishedLoading", string>(
  "FinishedLoading",
)
export type FinishedLoading = ActionCreatorType<typeof finishedLoading>
