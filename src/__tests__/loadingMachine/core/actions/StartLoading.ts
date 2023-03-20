import { type ActionCreatorType, createAction } from "../../../../action"

export const startLoading = createAction("StartLoading")
export type StartLoading = ActionCreatorType<typeof startLoading>
