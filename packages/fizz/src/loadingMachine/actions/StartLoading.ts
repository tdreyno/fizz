import { type ActionCreatorType, createAction } from "../../action.js"

export const startLoading = createAction("StartLoading")
export type StartLoading = ActionCreatorType<typeof startLoading>
