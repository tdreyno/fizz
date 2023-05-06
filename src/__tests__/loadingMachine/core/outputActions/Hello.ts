import { type ActionCreatorType, createAction } from "../../../../action"

export const hello = createAction("Hello")
export type Hello = ActionCreatorType<typeof hello>
