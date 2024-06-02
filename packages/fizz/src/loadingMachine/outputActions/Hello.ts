import { type ActionCreatorType, createAction } from "../../action.js"

export const hello = createAction("Hello")
export type Hello = ActionCreatorType<typeof hello>
