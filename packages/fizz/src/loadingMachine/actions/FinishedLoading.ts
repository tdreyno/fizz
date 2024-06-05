import { createAction } from "../../action.js"

export const finishedLoading = createAction<"FinishedLoading", string>(
  "FinishedLoading",
)
